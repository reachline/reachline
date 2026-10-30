// Signing in with an OpenID provider: the authorization code flow with PKCE,
// and the provider's back-channel logout. The provider is looked up on first
// use, and again after a failure, so the server starts while it's down.
import { createRemoteJWKSet, customFetch as joseFetch, jwtVerify } from 'jose';
import * as client from 'openid-client';
import type { OidcConfig } from './config.ts';

/** How requests reach the provider: openid-client's and jose's fetch options both fit. */
export type Fetch = (
  url: string,
  init: { method?: string; headers?: HeadersInit; body?: unknown },
) => Promise<Response>;

/** What the callback checks the provider's answer against. The browser keeps it, in a short-lived cookie. */
export interface Flow {
  state: string;
  nonce: string;
  verifier: string;
}

export interface SignIn {
  subject: string;
  /** The provider's session, which a back-channel logout names. */
  sid?: string;
  /** What the provider calls them, to show on the account page. */
  label: string;
  /** A username to start a new account from. */
  username: string;
}

/** Whom a back-channel logout signs out: a provider session, a user, or both. */
export interface Logout {
  sub?: string;
  sid?: string;
}

const LOGOUT_EVENT = 'http://schemas.openid.net/event/backchannel-logout';

export class Oidc {
  /** As identities store it. Discovery checks it is exactly what the provider says it is. */
  readonly issuer: string;
  readonly #settings: OidcConfig;
  readonly #redirect: URL;
  readonly #fetch?: Fetch;
  #config?: Promise<client.Configuration>;
  #jwks?: ReturnType<typeof createRemoteJWKSet>;

  constructor(settings: OidcConfig, redirect: URL, fetch?: Fetch) {
    this.issuer = settings.issuer.href;
    this.#settings = settings;
    this.#redirect = redirect;
    this.#fetch = fetch;
  }

  #configuration(): Promise<client.Configuration> {
    const { issuer, clientId, clientSecret } = this.#settings;
    this.#config ??= client
      .discovery(issuer, clientId, clientSecret, clientSecret ? undefined : client.None(), {
        // Config only allows http for a provider on loopback.
        // eslint-disable-next-line @typescript-eslint/no-deprecated -- deprecated only to stand out
        execute: issuer.protocol === 'http:' ? [client.allowInsecureRequests] : [],
        ...(this.#fetch && { [client.customFetch]: this.#fetch }),
      })
      .catch((e: unknown) => {
        this.#config = undefined;
        throw e;
      });
    return this.#config;
  }

  /** Where to send the browser, and what to keep for the callback. */
  async start(): Promise<{ url: URL; flow: Flow }> {
    const config = await this.#configuration();
    const flow = {
      state: client.randomState(),
      nonce: client.randomNonce(),
      verifier: client.randomPKCECodeVerifier(),
    };
    const url = client.buildAuthorizationUrl(config, {
      redirect_uri: this.#redirect.href,
      scope: 'openid profile email',
      state: flow.state,
      nonce: flow.nonce,
      code_challenge: await client.calculatePKCECodeChallenge(flow.verifier),
      code_challenge_method: 'S256',
    });
    return { url, flow };
  }

  /** Who signed in, from the provider's redirect back (`search`, its query string). */
  async finish(search: string, flow: Flow): Promise<SignIn> {
    const url = new URL(this.#redirect);
    url.search = search;
    const tokens = await client.authorizationCodeGrant(await this.#configuration(), url, {
      expectedState: flow.state,
      expectedNonce: flow.nonce,
      pkceCodeVerifier: flow.verifier,
      idTokenExpected: true,
    });
    const claims = tokens.claims()!;
    const text = (key: string) => (typeof claims[key] === 'string' && claims[key]) || undefined;
    const email = text('email');
    return {
      subject: claims.sub,
      sid: text('sid'),
      label: email ?? text('preferred_username') ?? text('name') ?? claims.sub,
      username: usernameFrom(text('preferred_username'), email?.split('@')[0], text('name')),
    };
  }

  /** Whom a back-channel logout token signs out; throws if it isn't one, signed by the provider. */
  async verifyLogout(token: string): Promise<Logout> {
    const meta = (await this.#configuration()).serverMetadata();
    if (!meta.jwks_uri) throw new Error('the provider publishes no keys (jwks_uri)');
    this.#jwks ??= createRemoteJWKSet(new URL(meta.jwks_uri), this.#fetch && { [joseFetch]: this.#fetch });
    const { payload } = await jwtVerify(token, this.#jwks, {
      issuer: meta.issuer,
      audience: this.#settings.clientId,
      requiredClaims: ['iat', 'jti', 'events'],
      maxTokenAge: '5m',
      clockTolerance: 30,
    });
    // A replayed token only signs out again, so jti isn't tracked.
    const { events, sub, sid } = payload as Record<string, unknown>;
    if (typeof events !== 'object' || events === null || !(LOGOUT_EVENT in events))
      throw new Error('not a logout token');
    if ('nonce' in payload) throw new Error('a logout token has no nonce');
    if (typeof sub !== 'string' && typeof sid !== 'string') throw new Error('a logout token names a sub or sid');
    return { sub: typeof sub === 'string' ? sub : undefined, sid: typeof sid === 'string' ? sid : undefined };
  }
}

/** The first candidate that has something left in the username alphabet, or `user`. */
export function usernameFrom(...candidates: (string | undefined)[]): string {
  for (const c of candidates) {
    const name = c
      ?.normalize('NFKD')
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, '')
      .slice(0, 32);
    if (name) return name;
  }
  return 'user';
}
