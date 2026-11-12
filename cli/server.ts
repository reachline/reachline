// Your server, from the command line: where it is, the token, and its API.
// The token is kept in ~/.config/reachline/config.json, readable only by you,
// unless REACHLINE_SERVER and REACHLINE_TOKEN say otherwise.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ApiError } from '../server/api.ts';
import { ReachError } from '../engine/model.ts';

/** Running as the bundle the server hands out, rather than from the repository. */
export const BUNDLED = import.meta.url.endsWith('.mjs');

export interface Login {
  server: string;
  token: string;
}

/** An environment variable, if it's set and not empty. */
const env = (name: string) => process.env[name] || undefined; // eslint-disable-line @typescript-eslint/prefer-nullish-coalescing -- empty is unset

const configDir = () => join(env('XDG_CONFIG_HOME') ?? join(homedir(), '.config'), 'reachline');
const configFile = () => join(configDir(), 'config.json');

function saved(): Partial<Login> {
  try {
    return JSON.parse(readFileSync(configFile(), 'utf8')) as Partial<Login>;
  } catch {
    return {};
  }
}

/** The server named by the environment or the last login, if any. */
export function serverUrl(): string | undefined {
  return env('REACHLINE_SERVER') ?? saved().server;
}

export function signedIn(): Login {
  const server = serverUrl();
  const token = env('REACHLINE_TOKEN') ?? saved().token;
  if (!server || !token) throw new ReachError('Not signed in: run reachline login https://your.server');
  return { server, token };
}

export function saveLogin(login: Login | null): void {
  if (!login) {
    rmSync(configFile(), { force: true });
    return;
  }
  mkdirSync(configDir(), { recursive: true, mode: 0o700 });
  writeFileSync(configFile(), JSON.stringify(login, null, 2) + '\n', { mode: 0o600 });
}

/** The origin of a server's URL, as typed. */
export function origin(url: string): string {
  try {
    const u = new URL(/^https?:\/\//.test(url) ? url : `https://${url}`);
    return u.origin;
  } catch {
    throw new ReachError(`${url}: not a URL`);
  }
}

/** The hash the server sends of the CLI it hands out, to compare with this one. */
export const ownHash = () =>
  BUNDLED
    ? createHash('sha256')
        .update(readFileSync(fileURLToPath(import.meta.url)))
        .digest('hex')
    : undefined;

let warned = false;

/** A request to the API. Fails unless the response is OK or one of `allow`. */
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- the caller names the body's type
export async function call<T>(
  login: Login,
  method: string,
  path: string,
  body?: unknown,
  allow: number[] = [],
): Promise<{ status: number; body: T }> {
  let res;
  try {
    res = await fetch(new URL(`/api${path}`, login.server), {
      method,
      headers: {
        authorization: `Bearer ${login.token}`,
        ...(body !== undefined && { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (e) {
    const cause = (e as Error).cause as (Error & { code?: string }) | undefined;
    throw new ReachError(`Can't reach ${login.server}: ${cause?.code ?? cause?.message ?? (e as Error).message}`);
  }
  const theirs = res.headers.get('reachline-cli');
  if (!warned && theirs && BUNDLED && theirs !== ownHash()) {
    warned = true;
    process.stderr.write('Your server has a different version of reachline; run reachline update.\n');
  }
  const json: unknown = res.headers.get('content-type')?.startsWith('application/json') ? await res.json() : null;
  if (res.ok || allow.includes(res.status)) return { status: res.status, body: json as T };
  if (res.status === 401) throw new ReachError(`${login.server} refused the token: run reachline login again`);
  throw new ReachError(`${login.server}: ${(json as ApiError | null)?.error ?? res.statusText}`);
}
