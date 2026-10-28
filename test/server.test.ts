// The server's API, in memory: who can do what, the revision check, and the
// request rules that stand in for CSRF protection.
import assert from 'node:assert/strict';
import { argon2Sync, randomBytes } from 'node:crypto';
import { test } from 'node:test';
import type {
  AuthOptions,
  Conflict,
  Created,
  Me,
  ModelDoc,
  ModelSummary,
  Revision,
  RevisionSummary,
  Saved,
} from '../server/api.ts';
import { createApp } from '../server/app.ts';
import { loadConfig } from '../server/config.ts';
import { openDb, Store } from '../server/db.ts';

const ORIGIN = 'http://127.0.0.1:5199';

function server(env: Record<string, string> = {}) {
  const store = new Store(openDb(':memory:'));
  return { store, app: createApp(store, loadConfig({ PUBLIC_URL: ORIGIN, ...env })) };
}

type App = ReturnType<typeof server>['app'];

/** A browser on the app's own origin that keeps its cookie between requests. */
class Browser {
  cookie = '';
  readonly app: App;

  constructor(app: App) {
    this.app = app;
  }

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- the caller names the body's type
  async call<T = unknown>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
    const res = await this.app.request(path, {
      method,
      headers: {
        'sec-fetch-site': 'same-origin',
        ...(body !== undefined && { 'content-type': 'application/json' }),
        ...(this.cookie && { cookie: this.cookie }),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.get('set-cookie');
    if (set) this.cookie = set.split(';')[0];
    return { status: res.status, headers: res.headers, body: (res.status === 204 ? null : await res.json()) as T };
  }

  async register(username: string, password = 'password1') {
    assert.equal((await this.call('POST', '/api/auth/register', { username, password })).status, 201);
    return this;
  }
}

const as = (app: App, username: string) => new Browser(app).register(username);

test('a session lasts from sign-in to sign-out, on the server as well as in the browser', async () => {
  const { app } = server();
  const a = await as(app, 'alice');
  assert.deepEqual((await a.call<Me>('GET', '/api/auth/me')).body, { username: 'alice' });

  const copy = new Browser(app);
  copy.cookie = a.cookie;
  assert.equal((await a.call('POST', '/api/auth/logout')).status, 204);
  assert.equal((await copy.call('GET', '/api/auth/me')).status, 401);

  assert.equal((await a.call('POST', '/api/auth/login', { username: 'alice', password: 'wrong-one' })).status, 401);
  assert.equal((await a.call('POST', '/api/auth/login', { username: 'Alice', password: 'password1' })).status, 200);
  assert.equal((await a.call('GET', '/api/auth/me')).status, 200);
});

test('an expired session is refused', async () => {
  const { app, store } = server();
  const a = await as(app, 'alice');
  store.db.prepare('update sessions set expires = ?').run(new Date(Date.now() - 1000).toISOString());
  assert.equal((await a.call('GET', '/api/auth/me')).status, 401);
});

test('the first account can always register; later ones only while registration is on', async () => {
  const { app } = server({ AUTH_REGISTRATION: '0' });
  const b = new Browser(app);
  assert.equal((await b.call<AuthOptions>('GET', '/api/auth/options')).body.registration, true);
  await b.register('alice');
  assert.equal((await b.call<AuthOptions>('GET', '/api/auth/options')).body.registration, false);
  const r = await new Browser(app).call('POST', '/api/auth/register', { username: 'bob', password: 'password1' });
  assert.equal(r.status, 403);
});

test('usernames are unique regardless of case', async () => {
  const { app } = server();
  await as(app, 'Alice');
  const r = await new Browser(app).call('POST', '/api/auth/register', { username: 'ALICE', password: 'password1' });
  assert.equal(r.status, 409);
});

test("a user can't see or change another user's models", async () => {
  const { app } = server();
  const a = await as(app, 'alice');
  const b = await as(app, 'bob');
  const { id } = (await a.call<Created>('POST', '/api/models', { name: 'm', text: 'x' })).body;

  assert.deepEqual((await b.call<ModelSummary[]>('GET', '/api/models')).body, []);
  for (const [method, path, body] of [
    ['GET', `/api/models/${id}`],
    ['PUT', `/api/models/${id}`, { text: 'y', base: 1 }],
    ['PATCH', `/api/models/${id}`, { name: 'n' }],
    ['DELETE', `/api/models/${id}`],
    ['GET', `/api/models/${id}/revisions`],
    ['GET', `/api/models/${id}/revisions/1`],
  ] as const)
    assert.equal((await b.call(method, path, body)).status, 404, `${method} ${path}`);
  assert.equal((await new Browser(app).call('GET', `/api/models/${id}`)).status, 401);
  assert.equal((await a.call<ModelDoc>('GET', `/api/models/${id}`)).body.text, 'x');
});

test('a save must start from the latest revision, and history only grows', async () => {
  const { app } = server();
  const a = await as(app, 'alice');
  const { id, revision: r1 } = (await a.call<Created>('POST', '/api/models', { name: 'm', text: 'one' })).body;

  const r2 = (await a.call<Saved>('PUT', `/api/models/${id}`, { text: 'two', base: r1 })).body.revision;
  const stale = await a.call<Conflict>('PUT', `/api/models/${id}`, { text: 'lost', base: r1 });
  assert.equal(stale.status, 409);
  assert.equal(stale.body.revision, r2);
  assert.deepEqual((await a.call<ModelDoc>('GET', `/api/models/${id}`)).body, {
    id,
    name: 'm',
    text: 'two',
    revision: r2,
  });

  const revs = (await a.call<RevisionSummary[]>('GET', `/api/models/${id}/revisions`)).body;
  assert.deepEqual(
    revs.map((r) => r.id),
    [r2, r1],
  );
  assert.equal((await a.call<Revision>('GET', `/api/models/${id}/revisions/${r1}`)).body.text, 'one');
});

test('model names are unique per user', async () => {
  const { app } = server();
  const a = await as(app, 'alice');
  const b = await as(app, 'bob');
  const { id } = (await a.call<Created>('POST', '/api/models', { name: 'home', text: '' })).body;
  await a.call('POST', '/api/models', { name: 'work', text: '' });

  assert.equal((await a.call('POST', '/api/models', { name: 'home', text: '' })).status, 409);
  assert.equal((await b.call('POST', '/api/models', { name: 'home', text: '' })).status, 201);
  assert.equal((await a.call('PATCH', `/api/models/${id}`, { name: 'work' })).status, 409);
  assert.equal((await a.call('PATCH', `/api/models/${id}`, { name: 'home' })).status, 204);
  assert.equal((await a.call('PATCH', `/api/models/${id}`, { name: 'house' })).status, 204);
});

test('deleting a model deletes its revisions', async () => {
  const { app, store } = server();
  const a = await as(app, 'alice');
  const { id, revision } = (await a.call<Created>('POST', '/api/models', { name: 'm', text: 'one' })).body;
  await a.call('PUT', `/api/models/${id}`, { text: 'two', base: revision });
  assert.equal((await a.call('DELETE', `/api/models/${id}`)).status, 204);
  assert.equal((await a.call('GET', `/api/models/${id}/revisions/${revision}`)).status, 404);
  assert.equal(store.db.prepare('select count(*) as n from revisions').get()!.n, 0);
});

test('requests that another site could forge are refused', async () => {
  const { app } = server();
  const a = await as(app, 'alice');
  const crossSite = { 'sec-fetch-site': 'cross-site', origin: 'https://evil.example' };

  // What a cross-site form or no-cors fetch can send: no body, or a "simple" content type.
  assert.equal((await a.call('POST', '/api/auth/logout', undefined, crossSite)).status, 403);
  const form = { ...crossSite, 'content-type': 'text/plain' };
  assert.equal((await a.call('POST', '/api/models', { name: 'm', text: '' }, form)).status, 403);
  // Sent as text/plain from the app itself, JSON is still refused, so csrf() never needs to look at JSON.
  const plain = { 'content-type': 'text/plain' };
  assert.equal((await a.call('POST', '/api/models', { name: 'm', text: '' }, plain)).status, 415);
  // Without Sec-Fetch-Site (older browsers), a matching Origin is enough.
  const old = { 'sec-fetch-site': '', origin: ORIGIN };
  assert.equal((await a.call('POST', '/api/auth/logout', undefined, old)).status, 204);
});

test('repeated failed logins make that username wait', async () => {
  const { app } = server();
  const a = await as(app, 'alice');
  await as(app, 'bob');
  for (let i = 0; i < 5; i++)
    assert.equal((await a.call('POST', '/api/auth/login', { username: 'alice', password: 'wrong-one' })).status, 401);
  const r = await a.call('POST', '/api/auth/login', { username: 'alice', password: 'password1' });
  assert.equal(r.status, 429);
  assert.ok(Number(r.headers.get('retry-after')) > 0);
  assert.equal((await a.call('POST', '/api/auth/login', { username: 'bob', password: 'password1' })).status, 200);
});

test('changing your password ends your other sessions', async () => {
  const { app } = server();
  const a = await as(app, 'alice');
  const other = new Browser(app);
  await other.call('POST', '/api/auth/login', { username: 'alice', password: 'password1' });

  const wrong = await a.call('POST', '/api/auth/password', { current: 'wrong-one', next: 'password2' });
  assert.equal(wrong.status, 403);
  assert.equal((await a.call('POST', '/api/auth/password', { current: 'password1', next: 'password2' })).status, 204);
  assert.equal((await a.call('GET', '/api/auth/me')).status, 200);
  assert.equal((await other.call('GET', '/api/auth/me')).status, 401);
  const login = await other.call('POST', '/api/auth/login', { username: 'alice', password: 'password2' });
  assert.equal(login.status, 200);
});

test('a hash made with other settings still verifies, and is redone at login', async () => {
  const { app, store } = server();
  await as(app, 'alice');
  const nonce = randomBytes(16);
  const params = { message: 'password1', nonce, memory: 8192, passes: 3, parallelism: 1, tagLength: 32 };
  const b64 = (b: Buffer) => b.toString('base64').replace(/=+$/, '');
  const old = `$argon2id$v=19$m=8192,t=3,p=1$${b64(nonce)}$${b64(argon2Sync('argon2id', params))}`;
  store.db.prepare('update users set password = ?').run(old);

  const r = await new Browser(app).call('POST', '/api/auth/login', { username: 'alice', password: 'password1' });
  assert.equal(r.status, 200);
  assert.match(store.userByName('alice')!.password!, /^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
});

test('PUBLIC_URL picks the cookie, and plain http only on loopback', async () => {
  const set = async (url: string) => {
    const r = await new Browser(server({ PUBLIC_URL: url }).app).call('POST', '/api/auth/register', {
      username: 'alice',
      password: 'password1',
    });
    return r.headers.get('set-cookie') ?? '';
  };
  const https = await set('https://reach.example.com');
  assert.match(https, /^__Host-session=/);
  assert.match(https, /; Secure/);
  assert.doesNotMatch(await set('http://localhost:5199'), /Secure|__Host-/);
  assert.throws(() => loadConfig({ PUBLIC_URL: 'http://reach.lan' }), /https/);
});

test('every response carries the strict CSP', async () => {
  const r = await new Browser(server().app).call('GET', '/api/health');
  assert.match(r.headers.get('content-security-policy') ?? '', /default-src 'none'.*script-src 'self'/);
});
