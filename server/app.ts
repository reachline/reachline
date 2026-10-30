// The HTTP app: the JSON API under /api, and the built UI for everything else.
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { except } from 'hono/combine';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import { csrf } from 'hono/csrf';
import { secureHeaders } from 'hono/secure-headers';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type {
  ApiError,
  AuthOptions,
  Conflict,
  Created,
  Me,
  ModelDoc,
  ModelSummary,
  Reauth,
  Redirect,
  Revision,
  RevisionSummary,
  Saved,
  SsoError,
} from './api.ts';
import {
  Busy,
  decoyHash,
  hashPassword,
  needsRehash,
  newSessionToken,
  PASSWORD,
  sessionId,
  Throttle,
  USERNAME,
  verifyPassword,
} from './auth.ts';
import type { Config } from './config.ts';
import type { NewSession, SessionUser, Store } from './db.ts';
import { Oidc, type Fetch, type Flow } from './oidc.ts';

const DAY = 86_400_000;
const SESSION_DAYS = 30;
const MAX_BODY = 4 * 1024 * 1024;
const MAX_NAME = 100;
// Adding a way in, or deleting the account, needs a sign-in this recent, so a
// stolen session can't make itself permanent.
const RECENT = 10 * 60_000;
const FLOW_SECONDS = 10 * 60;
// Called by the provider's server, not a browser, so it's exempt from csrf().
const BACKCHANNEL = '/api/auth/oidc/logout';

interface Env {
  Variables: { user: SessionUser };
}

function fail(status: ContentfulStatusCode, error: string, headers?: Record<string, string>): never {
  throw new HTTPException(status, { res: Response.json({ error } satisfies ApiError, { status, headers }) });
}

/** The JSON object body. Requiring application/json is what lets csrf() skip these requests. */
async function body(c: Context): Promise<Record<string, unknown>> {
  if (!c.req.header('content-type')?.startsWith('application/json')) fail(415, 'Send JSON');
  const b: unknown = await c.req.json().catch(() => fail(400, 'Malformed JSON'));
  if (typeof b !== 'object' || b === null || Array.isArray(b)) fail(400, 'Expected a JSON object');
  return b as Record<string, unknown>;
}

function str(b: Record<string, unknown>, key: string): string {
  const v = b[key];
  if (typeof v !== 'string') fail(400, `${key} must be a string`);
  return v;
}

function username(b: Record<string, unknown>): string {
  const u = str(b, 'username').trim().toLowerCase();
  if (!USERNAME.test(u)) fail(400, 'Usernames are 1–32 of a–z, 0–9, dot, dash and underscore');
  return u;
}

function newPassword(b: Record<string, unknown>, key: string): string {
  const p = str(b, key);
  if (p.length < PASSWORD.min || p.length > PASSWORD.max)
    fail(400, `Passwords are ${PASSWORD.min} to ${PASSWORD.max} characters`);
  return p;
}

function modelName(b: Record<string, unknown>): string {
  const n = str(b, 'name').trim();
  if (!n || n.length > MAX_NAME) fail(400, `Names are 1 to ${MAX_NAME} characters`);
  return n;
}

function id(c: Context, param: string): number {
  const v = c.req.param(param) ?? '';
  if (!/^[1-9]\d{0,15}$/.test(v)) fail(404, 'Not found');
  return Number(v);
}

/** A sign-in with the provider in progress: linking to `link`'s account, or signing in and going to `next`. */
interface FlowCookie extends Flow {
  link?: number;
  next?: string;
}

/** `fetch` reaches the OpenID provider; tests replace it. */
export function createApp(store: Store, config: Config, fetch?: Fetch): Hono<Env> {
  const secure = config.publicUrl.protocol === 'https:';
  // __Host- needs Secure, which browsers don't all accept over http, even on loopback.
  const COOKIE = secure ? '__Host-session' : 'session';
  const FLOW = secure ? '__Host-oidc' : 'oidc';
  const throttle = new Throttle();
  const oidc = config.oidc && new Oidc(config.oidc, new URL('/api/auth/oidc/callback', config.publicUrl), fetch);
  const app = new Hono<Env>();

  app.onError(async (e, c) => {
    if (e instanceof HTTPException) {
      // csrf() and bodyLimit() answer in plain text; the API always answers in JSON.
      const res = e.getResponse();
      if (res.headers.get('content-type')?.startsWith('application/json')) return res;
      return c.json<ApiError>({ error: e.message || (await res.text()) }, e.status);
    }
    if (e instanceof Busy) return c.json<ApiError>({ error: 'Busy; try again shortly' }, 503, { 'Retry-After': '5' });
    console.error(e);
    return c.json<ApiError>({ error: 'Internal error' }, 500);
  });

  app.use(
    secureHeaders({
      contentSecurityPolicy: {
        defaultSrc: ["'none'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'"],
        workerSrc: ["'self'"],
        fontSrc: ["'self'"],
        manifestSrc: ["'self'"],
        baseUri: ["'none'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],
      },
      strictTransportSecurity: false, // the reverse proxy's job
      permissionsPolicy: Object.fromEntries(
        [
          'accelerometer',
          'camera',
          'displayCapture',
          'geolocation',
          'gyroscope',
          'hid',
          'magnetometer',
          'microphone',
          'midi',
          'payment',
          'serial',
          'usb',
        ].map((d) => [d, false]),
      ),
    }),
  );
  app.use('/api/*', except(BACKCHANNEL, csrf({ origin: config.publicUrl.origin })), bodyLimit({ maxSize: MAX_BODY }));

  const cookie = { path: '/', httpOnly: true, secure, sameSite: 'Lax', maxAge: (SESSION_DAYS * DAY) / 1000 } as const;
  const expires = () => new Date(Date.now() + SESSION_DAYS * DAY).toISOString();

  function startSession(c: Context, userId: number, method: NewSession['method'], providerSid?: string) {
    const { token, id } = newSessionToken();
    store.createSession({ id, userId, expires: expires(), method, providerSid });
    setCookie(c, COOKIE, token, cookie);
  }

  function sessionUser(c: Context): SessionUser | undefined {
    const token = getCookie(c, COOKIE);
    return token ? store.sessionUser(sessionId(token)) : undefined;
  }

  const authed = createMiddleware<Env>(async (c, next) => {
    const user = sessionUser(c);
    if (!user) fail(401, 'Not signed in');
    // Extend while in use, at most once a day.
    if (Date.parse(user.expires) - Date.now() < (SESSION_DAYS - 1) * DAY) {
      const token = getCookie(c, COOKIE)!;
      store.extendSession(sessionId(token), expires());
      setCookie(c, COOKIE, token, cookie);
    }
    c.set('user', user);
    await next();
  });

  function requireRecentSignIn(c: Context<Env>) {
    // Sessions from before this was tracked have no time, and never count as recent.
    if (Date.now() - Date.parse(c.var.user.created) < RECENT) return;
    const res = Response.json({ error: 'Sign in again to do this', reauth: true } satisfies Reauth, { status: 403 });
    throw new HTTPException(403, { res });
  }

  const linkedAs = (userId: number) => (oidc && store.linkedAs(userId, oidc.issuer)) ?? null;

  function me(userId: number): Me {
    const user = store.userById(userId)!;
    return { username: user.username, password: user.password !== null, linked: linkedAs(userId) };
  }

  // While there are no users, anyone may register: that's how the first account is made.
  const canRegister = () => config.registration || store.userCount() === 0;

  function requirePasswords() {
    if (!config.password) fail(403, 'Signing in with a password is turned off');
  }

  /** Sends the browser to the provider, remembering what for. */
  async function toProvider(c: Context, purpose: Omit<FlowCookie, keyof Flow>): Promise<string> {
    const { url, flow } = await oidc!.start();
    const value = Buffer.from(JSON.stringify({ ...flow, ...purpose } satisfies FlowCookie)).toString('base64url');
    // Lax, like the session, so it comes back with the provider's redirect.
    setCookie(c, FLOW, value, { ...cookie, maxAge: FLOW_SECONDS });
    return url.href;
  }

  function takeFlow(c: Context): FlowCookie | undefined {
    const value = getCookie(c, FLOW);
    deleteCookie(c, FLOW, { path: '/', secure });
    try {
      return value ? (JSON.parse(Buffer.from(value, 'base64url').toString()) as FlowCookie) : undefined;
    } catch {
      return undefined;
    }
  }

  /** A path on this site to go to after signing in, or `/`. */
  function localPath(next: string | undefined): string {
    const url = new URL(next ?? '/', config.publicUrl);
    return url.origin === config.publicUrl.origin && url.pathname !== '/login' ? url.pathname + url.search : '/';
  }

  app.get('/api/health', (c) => c.json({ ok: true }));

  app.get('/api/auth/options', (c) =>
    c.json<AuthOptions>({
      registration: canRegister(),
      password: config.password,
      oidc: config.oidc?.label ?? null,
    }),
  );

  app.post('/api/auth/register', async (c) => {
    requirePasswords();
    if (!canRegister()) fail(403, 'Registration is closed');
    const b = await body(c);
    const name = username(b);
    const password = newPassword(b, 'password');
    if (store.userByName(name)) fail(409, 'That username is taken');
    const hash = await hashPassword(password);
    // Checked again after hashing: another request may have won meanwhile.
    if (!canRegister()) fail(403, 'Registration is closed');
    if (store.userByName(name)) fail(409, 'That username is taken');
    const userId = store.createUser(name, hash);
    startSession(c, userId, 'password');
    return c.json<Me>(me(userId), 201);
  });

  app.post('/api/auth/login', async (c) => {
    requirePasswords();
    const b = await body(c);
    const name = str(b, 'username').trim().toLowerCase();
    const password = str(b, 'password');
    const wait = throttle.wait(name);
    if (wait) fail(429, 'Too many attempts; try again later', { 'Retry-After': String(Math.ceil(wait / 1000)) });
    const user = store.userByName(name);
    const ok =
      password.length <= PASSWORD.max && (await verifyPassword(password, user?.password ?? (await decoyHash())));
    if (!user?.password || !ok) {
      throttle.fail(name);
      fail(401, 'Wrong username or password');
    }
    throttle.succeed(name);
    if (needsRehash(user.password)) store.setPassword(user.id, await hashPassword(password));
    store.deleteExpiredSessions();
    startSession(c, user.id, 'password');
    return c.json<Me>(me(user.id));
  });

  app.post('/api/auth/logout', (c) => {
    const token = getCookie(c, COOKIE);
    if (token) store.deleteSession(sessionId(token));
    deleteCookie(c, COOKIE, { path: '/', secure });
    return c.body(null, 204);
  });

  app.get('/api/auth/me', authed, (c) => c.json<Me>(me(c.var.user.userId)));

  app.delete('/api/auth/me', authed, (c) => {
    requireRecentSignIn(c);
    store.deleteUser(c.var.user.userId);
    deleteCookie(c, COOKIE, { path: '/', secure });
    return c.body(null, 204);
  });

  // Changes the password, or adds one to an account that has none.
  app.post('/api/auth/password', authed, async (c) => {
    requirePasswords();
    const b = await body(c);
    const next = newPassword(b, 'next');
    const { username: name, userId } = c.var.user;
    const user = store.userById(userId)!;
    if (!user.password) {
      requireRecentSignIn(c);
      store.setPassword(userId, await hashPassword(next));
      return c.body(null, 204);
    }
    const current = str(b, 'current');
    const wait = throttle.wait(name);
    if (wait) fail(429, 'Too many attempts; try again later', { 'Retry-After': String(Math.ceil(wait / 1000)) });
    if (current.length > PASSWORD.max || !(await verifyPassword(current, user.password))) {
      throttle.fail(name);
      fail(403, 'Wrong current password');
    }
    throttle.succeed(name);
    store.setPassword(userId, await hashPassword(next));
    store.deleteSessions(userId, sessionId(getCookie(c, COOKIE)!));
    return c.body(null, 204);
  });

  app.delete('/api/auth/password', authed, (c) => {
    const { userId } = c.var.user;
    if (!linkedAs(userId)) fail(409, 'Link your account with the provider first, or you could no longer sign in');
    store.setPassword(userId, null);
    return c.body(null, 204);
  });

  // Signing in with the provider is a link to this, not a form: CSP's form-action would block the redirect.
  app.get('/api/auth/oidc', async (c) => {
    const back = (problem: SsoError) => c.redirect(`/login?sso=${problem}`);
    if (!oidc) return back('failed');
    try {
      return c.redirect(await toProvider(c, { next: localPath(c.req.query('next')) }));
    } catch (e) {
      console.error(`OIDC: can't reach the provider: ${(e as Error).message}`);
      return back('failed');
    }
  });

  // Linking is a POST, so another site can't start it; the page then goes to the URL itself.
  app.post('/api/auth/oidc/link', authed, async (c) => {
    if (!oidc) fail(404, 'Not found');
    requireRecentSignIn(c);
    if (linkedAs(c.var.user.userId)) fail(409, 'Already linked');
    const url = await toProvider(c, { link: c.var.user.userId }).catch((e: unknown) => {
      console.error(`OIDC: can't reach the provider: ${(e as Error).message}`);
      fail(502, "Can't reach the provider");
    });
    return c.json<Redirect>({ url });
  });

  app.delete('/api/auth/oidc', authed, (c) => {
    if (!oidc) fail(404, 'Not found');
    const { userId } = c.var.user;
    if (!config.password || !store.userById(userId)!.password)
      fail(409, 'Add a password first, or you could no longer sign in');
    store.unlink(userId, oidc.issuer);
    return c.body(null, 204);
  });

  app.get('/api/auth/oidc/callback', async (c) => {
    const flow = takeFlow(c);
    const linking = flow?.link !== undefined;
    const back = (problem?: SsoError) =>
      c.redirect(linking ? `/account${problem ? `?sso=${problem}` : ''}` : `/login?sso=${problem}`);
    if (!oidc || !flow) return back('failed');

    let signIn;
    try {
      signIn = await oidc.finish(new URL(c.req.url).search, flow);
    } catch (e) {
      // Also how a sign-in cancelled at the provider ends up.
      console.error(`OIDC: sign-in failed: ${(e as Error).message}`);
      return back('failed');
    }
    const owner = store.identity(oidc.issuer, signIn.subject);

    if (linking) {
      // Still signed in as whoever started it.
      const user = sessionUser(c);
      if (!user || user.userId !== flow.link) return back('failed');
      if (owner) return back(owner.userId === user.userId ? undefined : 'taken');
      if (linkedAs(user.userId)) return back('failed');
      store.link(user.userId, oidc.issuer, signIn.subject, signIn.label);
      return back();
    }

    let userId = owner?.userId;
    if (userId === undefined) {
      if (!canRegister()) return back('closed');
      userId = store.createLinkedUser(signIn.username, oidc.issuer, signIn.subject, signIn.label).id;
    }
    store.deleteExpiredSessions();
    startSession(c, userId, 'oidc', signIn.sid);
    return c.redirect(localPath(flow.next));
  });

  // The provider ends a session it started here: OpenID Connect Back-Channel Logout.
  app.post(BACKCHANNEL, async (c) => {
    if (!oidc) fail(404, 'Not found');
    c.header('Cache-Control', 'no-store');
    const token = (await c.req.parseBody().catch(() => undefined))?.logout_token;
    if (typeof token !== 'string') fail(400, 'Expected a logout_token');
    const logout = await oidc.verifyLogout(token).catch((e: unknown) => {
      console.error(`OIDC: refused a back-channel logout: ${(e as Error).message}`);
      fail(400, 'Invalid logout token');
    });
    const userId = logout.sub === undefined ? undefined : store.identity(oidc.issuer, logout.sub)?.userId;
    // A subject with no account here has no sessions to end.
    if (logout.sub === undefined || userId !== undefined) store.endProviderSessions({ userId, sid: logout.sid });
    return c.body(null, 200);
  });

  app.use('/api/models', authed);
  app.use('/api/models/*', authed);

  app.get('/api/models', (c) => c.json<ModelSummary[]>(store.listModels(c.var.user.userId)));

  app.post('/api/models', async (c) => {
    const b = await body(c);
    const name = modelName(b);
    const text = str(b, 'text');
    const { userId } = c.var.user;
    if (store.modelNamed(userId, name) !== undefined) fail(409, 'You already have a model with that name');
    return c.json<Created>(store.createModel(userId, name, text), 201);
  });

  app.get('/api/models/:id', (c) => {
    const m = store.getModel(c.var.user.userId, id(c, 'id'));
    if (!m) fail(404, 'Not found');
    return c.json<ModelDoc>(m);
  });

  app.put('/api/models/:id', async (c) => {
    const modelId = id(c, 'id');
    const b = await body(c);
    const text = str(b, 'text');
    const base = b.base;
    if (typeof base !== 'number' || !Number.isInteger(base)) fail(400, 'base must be a revision id');
    const r = store.saveModel(c.var.user.userId, modelId, text, base);
    if (!r) fail(404, 'Not found');
    if ('latest' in r) return c.json<Conflict>({ error: 'Changed since you opened it', revision: r.latest }, 409);
    return c.json<Saved>({ revision: r.saved });
  });

  app.patch('/api/models/:id', async (c) => {
    const modelId = id(c, 'id');
    const name = modelName(await body(c));
    const { userId } = c.var.user;
    const other = store.modelNamed(userId, name);
    if (other !== undefined && other !== modelId) fail(409, 'You already have a model with that name');
    if (!store.renameModel(userId, modelId, name)) fail(404, 'Not found');
    return c.body(null, 204);
  });

  app.delete('/api/models/:id', (c) => {
    if (!store.deleteModel(c.var.user.userId, id(c, 'id'))) fail(404, 'Not found');
    return c.body(null, 204);
  });

  app.get('/api/models/:id/revisions', (c) => {
    const revs = store.listRevisions(c.var.user.userId, id(c, 'id'));
    if (!revs) fail(404, 'Not found');
    return c.json<RevisionSummary[]>(revs);
  });

  app.get('/api/models/:id/revisions/:rev', (c) => {
    const text = store.getRevision(c.var.user.userId, id(c, 'id'), id(c, 'rev'));
    if (text === undefined) fail(404, 'Not found');
    return c.json<Revision>({ text });
  });

  app.all('/api/*', () => fail(404, 'Not found'));

  // The UI: hashed assets cache forever, and every other path is the single page.
  app.use(
    '*',
    serveStatic({
      root: config.appDir,
      onFound: (_, c) => {
        c.header(
          'Cache-Control',
          c.req.path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
        );
      },
    }),
  );
  app.get(
    '*',
    serveStatic({ root: config.appDir, path: 'index.html', onFound: (_, c) => c.header('Cache-Control', 'no-cache') }),
  );

  return app;
}
