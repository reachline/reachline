// The HTTP app: the JSON API under /api, and the built UI for everything else.
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
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
  Revision,
  RevisionSummary,
  Saved,
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
import type { SessionUser, Store } from './db.ts';

const DAY = 86_400_000;
const SESSION_DAYS = 30;
const MAX_BODY = 4 * 1024 * 1024;
const MAX_NAME = 100;

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

export function createApp(store: Store, config: Config): Hono<Env> {
  const secure = config.publicUrl.protocol === 'https:';
  // __Host- needs Secure, which browsers don't all accept over http, even on loopback.
  const COOKIE = secure ? '__Host-session' : 'session';
  const throttle = new Throttle();
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
  app.use('/api/*', csrf({ origin: config.publicUrl.origin }), bodyLimit({ maxSize: MAX_BODY }));

  const cookie = { path: '/', httpOnly: true, secure, sameSite: 'Lax', maxAge: (SESSION_DAYS * DAY) / 1000 } as const;
  const expires = () => new Date(Date.now() + SESSION_DAYS * DAY).toISOString();

  function startSession(c: Context, userId: number) {
    const { token, id } = newSessionToken();
    store.createSession(id, userId, expires());
    setCookie(c, COOKIE, token, cookie);
  }

  const authed = createMiddleware<Env>(async (c, next) => {
    const token = getCookie(c, COOKIE);
    const sid = token ? sessionId(token) : '';
    const user = token ? store.sessionUser(sid) : undefined;
    if (!user) fail(401, 'Not signed in');
    // Extend while in use, at most once a day.
    if (Date.parse(user.expires) - Date.now() < (SESSION_DAYS - 1) * DAY) {
      store.extendSession(sid, expires());
      setCookie(c, COOKIE, token!, cookie);
    }
    c.set('user', user);
    await next();
  });

  // While there are no users, anyone may register: that's how the first account is made.
  const canRegister = () => config.registration || store.userCount() === 0;

  app.get('/api/health', (c) => c.json({ ok: true }));

  app.get('/api/auth/options', (c) => c.json<AuthOptions>({ registration: canRegister() }));

  app.post('/api/auth/register', async (c) => {
    if (!canRegister()) fail(403, 'Registration is closed');
    const b = await body(c);
    const name = username(b);
    const password = newPassword(b, 'password');
    if (store.userByName(name)) fail(409, 'That username is taken');
    const hash = await hashPassword(password);
    // Checked again after hashing: another request may have won meanwhile.
    if (!canRegister()) fail(403, 'Registration is closed');
    if (store.userByName(name)) fail(409, 'That username is taken');
    startSession(c, store.createUser(name, hash));
    return c.json<Me>({ username: name }, 201);
  });

  app.post('/api/auth/login', async (c) => {
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
    startSession(c, user.id);
    return c.json<Me>({ username: user.username });
  });

  app.post('/api/auth/logout', (c) => {
    const token = getCookie(c, COOKIE);
    if (token) store.deleteSession(sessionId(token));
    deleteCookie(c, COOKIE, { path: '/', secure });
    return c.body(null, 204);
  });

  app.get('/api/auth/me', authed, (c) => c.json<Me>({ username: c.var.user.username }));

  app.post('/api/auth/password', authed, async (c) => {
    const b = await body(c);
    const current = str(b, 'current');
    const next = newPassword(b, 'next');
    const { username: name } = c.var.user;
    const wait = throttle.wait(name);
    if (wait) fail(429, 'Too many attempts; try again later', { 'Retry-After': String(Math.ceil(wait / 1000)) });
    const user = store.userByName(name)!;
    if (!user.password || current.length > PASSWORD.max || !(await verifyPassword(current, user.password))) {
      throttle.fail(name);
      fail(403, 'Wrong current password');
    }
    throttle.succeed(name);
    store.setPassword(user.id, await hashPassword(next));
    store.deleteSessions(user.id, sessionId(getCookie(c, COOKIE)!));
    return c.body(null, 204);
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
