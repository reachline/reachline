// A server in memory, and a browser on its origin, for the server's tests.
import assert from 'node:assert/strict';
import { createApp } from '../server/app.ts';
import { loadConfig } from '../server/config.ts';
import { openDb, Store } from '../server/db.ts';
import type { Fetch } from '../server/oidc.ts';

export const ORIGIN = 'http://127.0.0.1:5199';

export function server(env: Record<string, string> = {}, fetch?: Fetch) {
  const store = new Store(openDb(':memory:'));
  return { store, app: createApp(store, loadConfig({ PUBLIC_URL: ORIGIN, ...env }), fetch) };
}

export type App = ReturnType<typeof server>['app'];

/** Keeps its cookies between requests, and doesn't follow redirects. */
export class Browser {
  readonly cookies = new Map<string, string>();
  readonly app: App;

  constructor(app: App) {
    this.app = app;
  }

  get cookie() {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- the caller names the body's type
  async call<T = unknown>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
    const res = await this.app.request(path, {
      method,
      headers: {
        'sec-fetch-site': 'same-origin',
        ...(body !== undefined && { 'content-type': 'application/json' }),
        ...(this.cookies.size && { cookie: this.cookie }),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    for (const set of res.headers.getSetCookie()) {
      const [, name, value] = /^([^=]+)=([^;]*)/.exec(set)!;
      if (/max-age=0/i.test(set)) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
    const json = res.headers.get('content-type')?.startsWith('application/json');
    return { status: res.status, headers: res.headers, body: (json ? await res.json() : null) as T };
  }

  async register(username: string, password = 'password1') {
    assert.equal((await this.call('POST', '/api/auth/register', { username, password })).status, 201);
    return this;
  }
}

export const as = (app: App, username: string) => new Browser(app).register(username);
