// Server settings from the environment. .env.template documents each one.
import { isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));

export interface Config {
  host: string;
  port: number;
  /** Where users reach the app; its scheme picks the cookie, and csrf checks its origin. */
  publicUrl: URL;
  dataDir: string;
  registration: boolean;
  /** The built app; it may not exist in development, where Vite serves it. */
  appDir: string;
}

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);

export function loadConfig(env: NodeJS.ProcessEnv): Config {
  const host = setting(env, 'HOST') ?? '127.0.0.1';
  const port = Number(setting(env, 'PORT') ?? 5199);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error(`PORT must be a port number, not ${env.PORT}`);

  const publicUrl = new URL(setting(env, 'PUBLIC_URL') ?? `http://127.0.0.1:${port}`);
  if (publicUrl.protocol !== 'https:' && publicUrl.protocol !== 'http:') throw new Error('PUBLIC_URL must be http(s)');
  if (publicUrl.pathname !== '/' || publicUrl.search || publicUrl.hash)
    throw new Error('PUBLIC_URL must be an origin only, such as https://reach.example.com');
  if (publicUrl.protocol === 'http:' && !LOOPBACK.has(publicUrl.hostname))
    throw new Error('PUBLIC_URL must be https unless it is 127.0.0.1 or localhost; put a TLS reverse proxy in front');

  const dataDir = setting(env, 'DATA_DIR');
  return {
    host,
    port,
    publicUrl,
    // Relative to the repository, so `DATA_DIR=data` means the same from any directory.
    dataDir: dataDir ? (isAbsolute(dataDir) ? dataDir : join(ROOT, dataDir)) : join(ROOT, '.dev'),
    registration: flag(env, 'AUTH_REGISTRATION', true),
    appDir: join(ROOT, 'app/dist'),
  };
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
