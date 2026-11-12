// The HTTP app: the JSON API under /api, and the built UI for everything else.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
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
  CreatedToken,
  Me,
  ModelDoc,
  ModelSummary,
  Reauth,
  Redirect,
  Revision,
  RevisionSummary,
  Saved,
  SsoError,
  TokenOwner,
  TokenSummary,
} from './api.ts';
import {
  Busy,
  decoyHash,
  hashPassword,
  needsRehash,
  newApiToken,
  newSessionToken,
  PASSWORD,
  sessionId,
  Throttle,
  USERNAME,
  verifyPassword,
} from './auth.ts';
import type { Config } from './config.ts';
import type { NewSession, SessionUser, Store, TokenUser } from './db.ts';
import { log } from './log.ts';
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
  // A token's user has no session: its times are empty, so a sign-in never counts as recent.
  Variables: { user: SessionUser; token?: TokenUser };
}

/** The secret from an `Authorization: Bearer` header. */
const bearer = (c: Context) => /^Bearer (\S+)$/i.exec(c.req.header('authorization') ?? '')?.[1];

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

/** A name someone typed, if it could be a username: what doesn't might be a password typed in the wrong box. */
const typed = (name: string) => (USERNAME.test(name) ? name : '(not a username)');

/**
 * What went wrong with the provider. openid-client's messages are generic; the OAuth error
 * is in fields. Never the whole error: its cause can hold the callback's query string.
 */
function oidcProblem(e: unknown): Record<string, string | undefined> {
  const { message, error, error_description, cause } = e as Error & { error?: unknown; error_description?: unknown };
  const str = (v: unknown) => (typeof v === 'string' ? v : undefined);
  // Such as ECONNREFUSED behind fetch's own "fetch failed".
  const why = cause instanceof Error ? (str((cause as Error & { code?: unknown }).code) ?? cause.message) : undefined;
  return { error: message, oauth: str(error), description: str(error_description), cause: why };
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
    if (e instanceof Busy) {
      log.warn('too many password checks at once; answered 503', { path: c.req.path });
      return c.json<ApiError>({ error: 'Busy; try again shortly' }, 503, { 'Retry-After': '5' });
    }
    log.error('unexpected error', { method: c.req.method, path: c.req.path }, e);
    return c.json<ApiError>({ error: 'Internal error' }, 500);
  });

  // The path only: a query string can carry the provider's code and state.
  app.use(async (c, next) => {
    const start = performance.now();
    await next();
    const ms = Math.round(performance.now() - start);
    log.debug('request', { method: c.req.method, path: c.req.path, status: c.res.status, ms });
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
  // A token's requests can't be forged by another site: a browser won't add the header without CORS, which isn't offered.
  const tokenRequest = (c: Context) => !c.req.path.startsWith('/api/auth/') && bearer(c) !== undefined;
  app.use(
    '/api/*',
    except([BACKCHANNEL, tokenRequest], csrf({ origin: config.publicUrl.origin })),
    bodyLimit({ maxSize: MAX_BODY }),
  );

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

  // The CLI the server hands out, so that one from elsewhere can tell it's out of date.
  const cliFile = join(config.appDir, 'reachline.mjs');
  const cliHash = existsSync(cliFile) ? createHash('sha256').update(readFileSync(cliFile)).digest('hex') : undefined;

  /** Signed in with a token, which reaches models and nothing else. */
  const tokenAuthed = createMiddleware<Env>(async (c, next) => {
    const secret = bearer(c);
    const token = secret === undefined ? undefined : store.tokenUser(sessionId(secret));
    if (!token) fail(401, secret === undefined ? 'Not signed in' : 'That token is revoked or wrong');
    c.set('user', { userId: token.userId, username: token.username, expires: '', created: '' });
    c.set('token', token);
    if (cliHash) c.header('ReachLine-CLI', cliHash);
    await next();
  });

  /** A token if the request has one, or else the session. */
  const tokenOrSession = createMiddleware<Env>((c, next) =>
    bearer(c) === undefined ? authed(c, next) : tokenAuthed(c, next),
  );

  function requireRecentSignIn(c: Context<Env>) {
    // Sessions from before this was tracked have no time, and never count as recent.
    if (Date.now() - Date.parse(c.var.user.created) < RECENT) return;
    const res = Response.json({ error: 'Sign in again to do this', reauth: true } satisfies Reauth, { status: 403 });
    throw new HTTPException(403, { res });
  }

  /**
   * The hash, if the password matches it; otherwise fails, throttling failures by name.
   * With no hash it checks against a decoy, so the time taken doesn't say whether there is one.
   */
  async function checkPassword(
    name: string,
    password: string,
    hash: string | null | undefined,
    status: 401 | 403,
    error: string,
  ): Promise<string> {
    const wait = throttle.wait(name);
    if (wait) fail(429, 'Too many attempts; try again later', { 'Retry-After': String(Math.ceil(wait / 1000)) });
    const ok = password.length <= PASSWORD.max && (await verifyPassword(password, hash ?? (await decoyHash())));
    if (!hash || !ok) {
      log.info(status === 401 ? 'sign-in failed' : 'wrong current password', { user: typed(name) });
      const delay = throttle.fail(name);
      if (delay) log.warn('repeated wrong passwords; this username must wait', { user: typed(name), s: delay / 1000 });
      fail(status, error);
    }
    throttle.succeed(name);
    return hash;
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
    log.info('account created', { user: name, method: 'password' });
    startSession(c, userId, 'password');
    return c.json<Me>(me(userId), 201);
  });

  app.post('/api/auth/login', async (c) => {
    requirePasswords();
    const b = await body(c);
    const name = str(b, 'username').trim().toLowerCase();
    const password = str(b, 'password');
    const user = store.userByName(name);
    const hash = await checkPassword(name, password, user?.password, 401, 'Wrong username or password');
    const { id } = user!; // there's a hash, so there's a user
    if (needsRehash(hash)) store.setPassword(id, await hashPassword(password));
    store.deleteExpiredSessions();
    startSession(c, id, 'password');
    log.info('signed in', { user: name, method: 'password' });
    return c.json<Me>(me(id));
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
    log.info('account deleted', { user: c.var.user.username });
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
      log.info('password added', { user: name });
      return c.body(null, 204);
    }
    await checkPassword(name, str(b, 'current'), user.password, 403, 'Wrong current password');
    store.setPassword(userId, await hashPassword(next));
    // Whoever knew the old password keeps no way in: not a session, and not a token they made with it.
    store.deleteSessions(userId, sessionId(getCookie(c, COOKIE)!));
    store.deleteTokens(userId);
    log.info('password changed', { user: name });
    return c.body(null, 204);
  });

  app.delete('/api/auth/password', authed, (c) => {
    const { userId, username: name } = c.var.user;
    if (!linkedAs(userId)) fail(409, 'Link your account with the provider first, or you could no longer sign in');
    store.setPassword(userId, null);
    log.info('password removed', { user: name });
    return c.body(null, 204);
  });

  // Signing in with the provider is a link to this, not a form: CSP's form-action would block the redirect.
  app.get('/api/auth/oidc', async (c) => {
    const back = (problem: SsoError) => c.redirect(`/login?sso=${problem}`);
    if (!oidc) return back('failed');
    try {
      return c.redirect(await toProvider(c, { next: localPath(c.req.query('next')) }));
    } catch (e) {
      log.warn("can't reach the OpenID provider", oidcProblem(e));
      return back('failed');
    }
  });

  // Linking is a POST, so another site can't start it; the page then goes to the URL itself.
  app.post('/api/auth/oidc/link', authed, async (c) => {
    if (!oidc) fail(404, 'Not found');
    requireRecentSignIn(c);
    if (linkedAs(c.var.user.userId)) fail(409, 'Already linked');
    const url = await toProvider(c, { link: c.var.user.userId }).catch((e: unknown) => {
      log.warn("can't reach the OpenID provider", oidcProblem(e));
      fail(502, "Can't reach the provider");
    });
    return c.json<Redirect>({ url });
  });

  app.delete('/api/auth/oidc', authed, (c) => {
    if (!oidc) fail(404, 'Not found');
    const { userId, username: name } = c.var.user;
    if (!config.password || !store.userById(userId)!.password)
      fail(409, 'Add a password first, or you could no longer sign in');
    store.unlink(userId, oidc.issuer);
    log.info('unlinked the provider', { user: name });
    return c.body(null, 204);
  });

  app.get('/api/auth/oidc/callback', async (c) => {
    const flow = takeFlow(c);
    const linking = flow?.link !== undefined;
    const back = (problem?: SsoError) =>
      c.redirect(linking ? `/account${problem ? `?sso=${problem}` : ''}` : `/login?sso=${problem}`);
    if (!oidc) return back('failed');
    if (!flow) {
      log.debug('provider sign-in returned without one in progress here (expired, or another browser)');
      return back('failed');
    }

    let signIn;
    try {
      signIn = await oidc.finish(new URL(c.req.url).search, flow);
    } catch (e) {
      const problem = oidcProblem(e);
      // Cancelled at the provider, or refused there.
      if (problem.oauth === 'access_denied') log.info('provider sign-in cancelled or refused', problem);
      else log.warn('provider sign-in failed', problem);
      return back('failed');
    }
    const owner = store.identity(oidc.issuer, signIn.subject);

    if (linking) {
      // Still signed in as whoever started it.
      const user = sessionUser(c);
      if (!user || user.userId !== flow.link) return back('failed');
      if (owner?.userId === user.userId) return back();
      if (owner) {
        log.info('provider identity already linked to another account', { user: user.username });
        return back('taken');
      }
      if (linkedAs(user.userId)) return back('failed');
      store.link(user.userId, oidc.issuer, signIn.subject, signIn.label);
      log.info('linked the provider', { user: user.username });
      return back();
    }

    let userId = owner?.userId;
    if (userId === undefined && config.oidc!.linkUsername && signIn.claimedUsername) {
      // Never by the fallbacks a new account's name comes from: alice@evil.test isn't alice.
      const named = store.userByName(signIn.claimedUsername);
      if (named && !linkedAs(named.id)) {
        store.link(named.id, oidc.issuer, signIn.subject, signIn.label);
        log.info('linked the provider, by username', { user: named.username });
        userId = named.id;
      }
    }
    if (userId === undefined) {
      if (!canRegister()) {
        log.info('provider sign-in refused: no account, and registration is closed');
        return back('closed');
      }
      const user = store.createLinkedUser(signIn.username, oidc.issuer, signIn.subject, signIn.label);
      log.info('account created', { user: user.username, method: 'oidc' });
      userId = user.id;
    }
    store.deleteExpiredSessions();
    startSession(c, userId, 'oidc', signIn.sid);
    log.info('signed in', { user: store.userById(userId)!.username, method: 'oidc' });
    return c.redirect(localPath(flow.next));
  });

  // The provider ends a session it started here: OpenID Connect Back-Channel Logout.
  app.post(BACKCHANNEL, async (c) => {
    if (!oidc) fail(404, 'Not found');
    c.header('Cache-Control', 'no-store');
    const token = (await c.req.parseBody().catch(() => undefined))?.logout_token;
    if (typeof token !== 'string') fail(400, 'Expected a logout_token');
    const logout = await oidc.verifyLogout(token).catch((e: unknown) => {
      log.warn('refused a back-channel logout', oidcProblem(e));
      fail(400, 'Invalid logout token');
    });
    const userId = logout.sub === undefined ? undefined : store.identity(oidc.issuer, logout.sub)?.userId;
    // A subject with no account here has no sessions to end.
    const ended =
      logout.sub === undefined || userId !== undefined ? store.endProviderSessions({ userId, sid: logout.sid }) : 0;
    log.info('back-channel logout', {
      user: userId === undefined ? undefined : store.userById(userId)?.username,
      sessions: ended,
    });
    return c.body(null, 200);
  });

  // Tokens for the command line are made and revoked in the app, never with a token.
  app.get('/api/auth/tokens', authed, (c) => c.json<TokenSummary[]>(store.listTokens(c.var.user.userId)));

  app.post('/api/auth/tokens', authed, async (c) => {
    requireRecentSignIn(c); // a token is a way in
    const name = modelName(await body(c));
    const { userId, username: user } = c.var.user;
    const { token, hash } = newApiToken();
    const created = store.createToken(userId, name, hash);
    if (!created) fail(409, 'You already have a token with that name');
    log.info('token created', { user, token: name });
    return c.json<CreatedToken>({ ...created, token }, 201);
  });

  app.delete('/api/auth/tokens/:id', authed, (c) => {
    if (!store.deleteToken(c.var.user.userId, id(c, 'id'))) fail(404, 'Not found');
    log.info('token revoked', { user: c.var.user.username });
    return c.body(null, 204);
  });

  app.get('/api/token', tokenAuthed, (c) =>
    c.json<TokenOwner>({ username: c.var.user.username, name: c.var.token!.name }),
  );

  // Signing out of the command line revokes its token.
  app.delete('/api/token', tokenAuthed, (c) => {
    const { userId, tokenId, name, username: user } = c.var.token!;
    store.deleteToken(userId, tokenId);
    log.info('token revoked', { user, token: name });
    return c.body(null, 204);
  });

  app.use('/api/models', tokenOrSession);
  app.use('/api/models/*', tokenOrSession);

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
    const r = store.saveModel(c.var.user.userId, modelId, text, base, c.var.token?.name);
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
