// Server settings from the environment. .env.template documents each one.
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));

export interface Config {
  host: string;
  port: number;
  /** Where users reach the app; its scheme picks the cookie, and csrf checks its origin. */
  publicUrl: URL;
  dataDir: string;
  registration: boolean;
  /** Whether users may sign in with a password. */
  password: boolean;
  /** The OpenID provider users may sign in with, if any. */
  oidc?: OidcConfig;
  /** The built app; it may not exist in development, where Vite serves it. */
  appDir: string;
  /** Allowed, but worth saying at startup. */
  warnings: string[];
}

export interface OidcConfig {
  issuer: URL;
  clientId: string;
  /** None for a public client, which PKCE alone protects. */
  clientSecret?: string;
  /** What the sign-in button says. */
  label: string;
  /** Whether a first sign-in claims the account of the same name, trusting the provider's usernames. */
  linkUsername: boolean;
}

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);

export function loadConfig(env: NodeJS.ProcessEnv): Config {
  const host = setting(env, 'HOST') ?? '127.0.0.1';
  const port = Number(setting(env, 'PORT') ?? 6060);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error(`PORT must be a port number, not ${env.PORT}`);

  const url = setting(env, 'PUBLIC_URL');
  if (url === undefined) throw new Error('PUBLIC_URL is required, such as https://reachline.example.com');
  const publicUrl = new URL(url);
  if (publicUrl.protocol !== 'https:' && publicUrl.protocol !== 'http:') throw new Error('PUBLIC_URL must be http(s)');
  if (publicUrl.pathname !== '/' || publicUrl.search || publicUrl.hash)
    throw new Error('PUBLIC_URL must be an origin only, such as https://reachline.example.com');

  const auth = methods(env);
  const warnings: string[] = [];
  if (plainHttp(publicUrl))
    warnings.push('PUBLIC_URL is plain http, so passwords and sessions cross the network unencrypted');
  if (auth.oidc && plainHttp(auth.oidc.issuer))
    warnings.push('AUTH_OIDC_ISSUER is plain http, so sign-ins with the provider cross the network unencrypted');

  const dataDir = setting(env, 'DATA_DIR');
  return {
    host,
    port,
    publicUrl,
    // Relative to the repository, so a relative path means the same from any directory.
    dataDir: resolve(ROOT, dataDir ?? 'data'),
    registration: flag(env, 'AUTH_REGISTRATION', true),
    ...auth,
    appDir: join(ROOT, 'app/dist'),
    warnings,
  };
}

const plainHttp = (url: URL) => url.protocol === 'http:' && !LOOPBACK.has(url.hostname);

const METHODS = ['password', 'oidc'];
const OIDC_SETTINGS = [
  'AUTH_OIDC_ISSUER',
  'AUTH_OIDC_CLIENT_ID',
  'AUTH_OIDC_CLIENT_SECRET',
  'AUTH_OIDC_LABEL',
  'AUTH_OIDC_LINK_USERNAME',
];

function methods(env: NodeJS.ProcessEnv): Pick<Config, 'password' | 'oidc'> {
  const list = (setting(env, 'AUTH_METHODS') ?? 'password').split(',').map((m) => m.trim());
  const unknown = list.find((m) => !METHODS.includes(m));
  if (unknown !== undefined) throw new Error(`AUTH_METHODS is a list of password and oidc, not ${unknown || 'empty'}`);
  if (!list.includes('oidc')) {
    // Settings that would silently do nothing are more likely a mistake than a choice.
    const set = OIDC_SETTINGS.find((name) => setting(env, name) !== undefined);
    if (set) throw new Error(`${set} is set, but AUTH_METHODS doesn't include oidc`);
    return { password: true };
  }

  const issuer = new URL(required(env, 'AUTH_OIDC_ISSUER'));
  if (issuer.protocol !== 'https:' && issuer.protocol !== 'http:') throw new Error('AUTH_OIDC_ISSUER must be http(s)');
  return {
    password: list.includes('password'),
    oidc: {
      issuer,
      clientId: required(env, 'AUTH_OIDC_CLIENT_ID'),
      clientSecret: setting(env, 'AUTH_OIDC_CLIENT_SECRET'),
      label: setting(env, 'AUTH_OIDC_LABEL') ?? 'Sign in with SSO',
      linkUsername: flag(env, 'AUTH_OIDC_LINK_USERNAME', true),
    },
  };
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const v = setting(env, name);
  if (v === undefined) throw new Error(`${name} is required when AUTH_METHODS includes oidc`);
  return v;
}

/** An empty value, as in a template's `NAME=`, counts as unset. */
function setting(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const v = env[name]?.trim();
  return v === '' ? undefined : v;
}

function flag(env: NodeJS.ProcessEnv, name: string, fallback: boolean): boolean {
  const v = setting(env, name);
  if (v === undefined) return fallback;
  if (v === '1' || v === 'true') return true;
  if (v === '0' || v === 'false') return false;
  throw new Error(`${name} must be 1 or 0, not ${v}`);
}
