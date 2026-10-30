// Signing in with an OpenID provider, against a fake one in memory: who ends
// up signed in as whom, the account's ways in, and back-channel logout.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { exportJWK, generateKeyPair, SignJWT, type CryptoKey, type GenerateKeyPairResult, type JWTPayload } from 'jose';
import type { AuthOptions, Me, Redirect } from '../server/api.ts';
import { loadConfig } from '../server/config.ts';
import type { Fetch } from '../server/oidc.ts';
import { as, Browser, ORIGIN, server } from './browser.ts';

const ISSUER = 'https://idp.test/';
const CLIENT = 'reachline';
const OIDC = { AUTH_METHODS: 'password,oidc', AUTH_OIDC_ISSUER: ISSUER, AUTH_OIDC_CLIENT_ID: CLIENT };

interface Person extends JWTPayload {
  sub: string;
  sid?: string;
  email?: string;
  preferred_username?: string;
}

/** The provider: its discovery document, keys and token endpoint, and a person signing in at it. */
class Provider {
  readonly #key: CryptoKey;
  readonly #public: CryptoKey;
  readonly #codes = new Map<string, { person: Person; nonce: string; challenge: string }>();

  constructor(keys: GenerateKeyPairResult) {
    this.#key = keys.privateKey;
    this.#public = keys.publicKey;
  }

  static async create(): Promise<Provider> {
    return new Provider(await generateKeyPair('RS256', { extractable: true }));
  }

  readonly fetch: Fetch = async (url, init) => {
    const json = (body: unknown, status = 200) => Response.json(body, { status });
    switch (url) {
      case `${ISSUER}.well-known/openid-configuration`:
        return json({
          issuer: ISSUER,
          authorization_endpoint: `${ISSUER}authorize`,
          token_endpoint: `${ISSUER}token`,
          jwks_uri: `${ISSUER}jwks`,
          response_types_supported: ['code'],
          subject_types_supported: ['public'],
          id_token_signing_alg_values_supported: ['RS256'],
        });
      case `${ISSUER}jwks`:
        return json({ keys: [{ ...(await exportJWK(this.#public)), kid: 'k', alg: 'RS256', use: 'sig' }] });
      case `${ISSUER}token`: {
        const form = new URLSearchParams(String(init.body));
        const grant = this.#codes.get(form.get('code') ?? '');
        this.#codes.delete(form.get('code') ?? '');
        const challenge = createHash('sha256')
          .update(form.get('code_verifier') ?? '')
          .digest('base64url');
        if (grant?.challenge !== challenge) return json({ error: 'invalid_grant' }, 400);
        const idToken = await this.sign({ ...grant.person, nonce: grant.nonce });
        return json({ access_token: 'at', token_type: 'Bearer', expires_in: 60, id_token: idToken });
      }
    }
    return json({ error: 'not found' }, 404);
  };

  sign(claims: JWTPayload, key = this.#key): Promise<string> {
    return new SignJWT(claims)
      .setProtectedHeader({ alg: 'RS256', kid: 'k' })
      .setIssuer(ISSUER)
      .setAudience(CLIENT)
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(key);
  }

  /** The person signs in at the provider, which sends the browser back to this path. */
  authorize(authorizeUrl: string, person: Person): string {
    const url = new URL(authorizeUrl);
    const q = (k: string) => url.searchParams.get(k) ?? '';
    assert.equal(q('redirect_uri'), `${ORIGIN}/api/auth/oidc/callback`);
    assert.equal(q('code_challenge_method'), 'S256');
    const code = randomUUID();
    this.#codes.set(code, { person, nonce: q('nonce'), challenge: q('code_challenge') });
    return `/api/auth/oidc/callback?code=${code}&state=${q('state')}`;
  }

  logoutToken(claims: { sub?: string; sid?: string }, key?: CryptoKey): Promise<string> {
    const events = { 'http://schemas.openid.net/event/backchannel-logout': {} };
    return this.sign({ ...claims, events, jti: randomUUID() }, key);
  }

  /** As the provider's server sends it: a form, with no browser's headers. */
  async logout(app: Browser['app'], claims: { sub?: string; sid?: string }, key?: CryptoKey) {
    const body = new URLSearchParams({ logout_token: await this.logoutToken(claims, key) });
    const res = await app.request('/api/auth/oidc/logout', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });
    return res.status;
  }
}

async function setup(env: Record<string, string> = {}) {
  const idp = await Provider.create();
  return { idp, ...server({ ...OIDC, ...env }, idp.fetch) };
}

/** Signs in at the provider from `b`, starting with `start`; the callback's response. */
async function viaProvider(b: Browser, idp: Provider, person: Person, start = '/api/auth/oidc') {
  const r =
    start === 'link'
      ? await b.call<Redirect>('POST', '/api/auth/oidc/link')
      : await b.call('GET', start, undefined, { 'sec-fetch-site': 'none' });
  const to = r.headers.get('location') ?? (r.body as Redirect | null)?.url;
  assert.ok(to?.startsWith(`${ISSUER}authorize?`), `went to ${to} (${r.status})`);
  return callback(b, idp.authorize(to!, person));
}

const callback = (b: Browser, path: string) => b.call('GET', path, undefined, { 'sec-fetch-site': 'cross-site' });
const me = async (b: Browser) => (await b.call<Me>('GET', '/api/auth/me')).body;
const staleSessions = (store: ReturnType<typeof server>['store']) =>
  store.db.prepare('update sessions set created = ?').run(new Date(Date.now() - 3600_000).toISOString());

test('the first sign-in with the provider makes an account; later ones find it by issuer and subject', async () => {
  const { app, idp } = await setup();
  await as(app, 'alice');

  // Same name as a local account, so a new one alongside it, never the same one.
  const b = new Browser(app);
  const r = await viaProvider(b, idp, { sub: 's1', email: 'alice@idp.test', preferred_username: 'Alice' });
  assert.equal(r.status, 302);
  assert.equal(r.headers.get('location'), '/');
  assert.deepEqual(await me(b), { username: 'alice-2', password: false, linked: 'alice@idp.test' });

  const again = new Browser(app);
  const r2 = await viaProvider(again, idp, { sub: 's1', preferred_username: 'renamed' }, '/api/auth/oidc?next=/m/1');
  assert.equal(r2.headers.get('location'), '/m/1');
  assert.equal((await me(again)).username, 'alice-2');

  const elsewhere = await viaProvider(new Browser(app), idp, { sub: 's2' }, '/api/auth/oidc?next=https://evil.test/');
  assert.equal(elsewhere.headers.get('location'), '/');
});

test('with registration closed, only an identity that is already linked signs in', async () => {
  const { app, idp, store } = await setup({ AUTH_REGISTRATION: '0' });
  const first = new Browser(app);
  await viaProvider(first, idp, { sub: 's1', preferred_username: 'Zoë' });
  assert.equal((await me(first)).username, 'zoe');

  const b = new Browser(app);
  const r = await viaProvider(b, idp, { sub: 's2' });
  assert.equal(r.headers.get('location'), '/login?sso=closed');
  assert.equal((await b.call('GET', '/api/auth/me')).status, 401);
  assert.equal(store.userCount(), 1);
});

test('the callback only completes a sign-in that this browser started', async () => {
  const { app, idp } = await setup();
  // Another browser's callback, as a link to a victim: the state doesn't match the victim's own.
  const attacker = new Browser(app);
  const start = await attacker.call('GET', '/api/auth/oidc');
  const forged = idp.authorize(start.headers.get('location')!, { sub: 'attacker' });

  const victim = new Browser(app);
  await victim.call('GET', '/api/auth/oidc');
  assert.equal((await callback(victim, forged)).headers.get('location'), '/login?sso=failed');
  assert.equal((await victim.call('GET', '/api/auth/me')).status, 401);
  // Nor with no sign-in started at all.
  assert.equal((await callback(new Browser(app), forged)).headers.get('location'), '/login?sso=failed');
});

test('linking the provider needs a recent sign-in, and an identity links to one account only', async () => {
  const { app, idp, store } = await setup();
  const a = await as(app, 'alice');
  staleSessions(store);
  const stale = await a.call('POST', '/api/auth/oidc/link');
  assert.equal(stale.status, 403);
  assert.deepEqual(stale.body, { error: 'Sign in again to do this', reauth: true });

  await a.call('POST', '/api/auth/login', { username: 'alice', password: 'password1' });
  const linked = await viaProvider(a, idp, { sub: 's1', email: 'alice@idp.test' }, 'link');
  assert.equal(linked.headers.get('location'), '/account');
  assert.equal((await me(a)).linked, 'alice@idp.test');

  const viaIdp = new Browser(app);
  await viaProvider(viaIdp, idp, { sub: 's1' });
  assert.equal((await me(viaIdp)).username, 'alice');

  const b = await as(app, 'bob');
  assert.equal((await viaProvider(b, idp, { sub: 's1' }, 'link')).headers.get('location'), '/account?sso=taken');
  assert.equal((await me(b)).linked, null);
});

test('an account always keeps a way to sign in', async () => {
  const { app, idp, store } = await setup();
  const a = await as(app, 'alice');
  assert.equal((await a.call('DELETE', '/api/auth/password')).status, 409);

  const o = new Browser(app);
  await viaProvider(o, idp, { sub: 's1' });
  assert.equal((await o.call('DELETE', '/api/auth/oidc')).status, 409);

  // Adding a password is a new way in, so it needs a recent sign-in; then the link can go.
  staleSessions(store);
  assert.equal((await o.call('POST', '/api/auth/password', { next: 'password2' })).status, 403);
  await viaProvider(o, idp, { sub: 's1' });
  assert.equal((await o.call('POST', '/api/auth/password', { next: 'password2' })).status, 204);
  assert.equal((await o.call('DELETE', '/api/auth/oidc')).status, 204);
  assert.deepEqual(await me(o), { username: 'user', password: true, linked: null });
  assert.equal((await o.call('DELETE', '/api/auth/password')).status, 409);
});

test('with password sign-in off, the provider is the only way in', async () => {
  const { app, idp } = await setup({ AUTH_METHODS: 'oidc', AUTH_OIDC_LABEL: 'Sign in with Authentik' });
  const b = new Browser(app);
  const options = (await b.call<AuthOptions>('GET', '/api/auth/options')).body;
  assert.deepEqual(options, { registration: true, password: false, oidc: 'Sign in with Authentik' });
  const login = { username: 'alice', password: 'password1' };
  assert.equal((await b.call('POST', '/api/auth/register', login)).status, 403);
  assert.equal((await b.call('POST', '/api/auth/login', login)).status, 403);

  await viaProvider(b, idp, { sub: 's1' });
  assert.equal((await b.call('POST', '/api/auth/password', { next: 'password2' })).status, 403);
});

test('deleting an account needs a recent sign-in, and takes its models with it', async () => {
  const { app, store } = server();
  const a = await as(app, 'alice');
  await a.call('POST', '/api/models', { name: 'm', text: 'x' });
  staleSessions(store);
  assert.equal((await a.call('DELETE', '/api/auth/me')).status, 403);

  await a.call('POST', '/api/auth/login', { username: 'alice', password: 'password1' });
  assert.equal((await a.call('DELETE', '/api/auth/me')).status, 204);
  assert.equal((await a.call('GET', '/api/auth/me')).status, 401);
  assert.equal(store.db.prepare('select count(*) as n from models').get()!.n, 0);
  assert.equal(store.userCount(), 0);
});

test("a back-channel logout ends the provider's sessions here, and nothing else", async () => {
  const { app, idp } = await setup();
  const a = await as(app, 'alice');
  await viaProvider(a, idp, { sub: 's1' }, 'link');
  const [one, two] = [new Browser(app), new Browser(app)];
  await viaProvider(one, idp, { sub: 's1', sid: 'one' });
  await viaProvider(two, idp, { sub: 's1', sid: 'two' });
  const signedIn = async (b: Browser) => (await b.call('GET', '/api/auth/me')).status === 200;

  const { privateKey: forger } = await generateKeyPair('RS256');
  assert.equal(await idp.logout(app, { sid: 'one' }, forger), 400);
  assert.ok(await signedIn(one));

  assert.equal(await idp.logout(app, { sid: 'one' }), 200);
  assert.deepEqual([await signedIn(one), await signedIn(two), await signedIn(a)], [false, true, true]);

  // Only the subject: every session the provider started for them, but not their password sessions.
  assert.equal(await idp.logout(app, { sub: 's1' }), 200);
  assert.deepEqual([await signedIn(two), await signedIn(a)], [false, true]);
});

test('AUTH_METHODS and the provider settings must agree', () => {
  const base = { PUBLIC_URL: ORIGIN };
  assert.throws(() => loadConfig({ ...base, AUTH_METHODS: 'oidc' }), /AUTH_OIDC_ISSUER is required/);
  assert.throws(() => loadConfig({ ...base, AUTH_OIDC_ISSUER: ISSUER }), /AUTH_METHODS doesn't include oidc/);
  assert.throws(() => loadConfig({ ...base, AUTH_METHODS: 'basic' }), /not basic/);
  assert.throws(() => loadConfig({ ...base, ...OIDC, AUTH_OIDC_ISSUER: 'http://idp.lan/' }), /https/);
  assert.equal(loadConfig({ ...base, ...OIDC }).password, true);
});
