// The server's API. A 401 outside /auth means the session has ended, so it
// sends the page to the login form.
import type {
  ApiError,
  AuthOptions,
  Created,
  Credentials,
  Me,
  ModelDoc,
  ModelSummary,
  NewModel,
  PasswordChange,
  Revision,
  RevisionSummary,
  Save,
  Saved,
} from '../../server/api.ts';
import { toLogin } from './route.svelte.ts';

export class ApiFailure extends Error {
  readonly status: number;
  readonly body: ApiError;

  constructor(status: number, body: ApiError) {
    super(body.error);
    this.status = status;
    this.body = body;
  }
}

async function call(method: string, path: string, body?: unknown): Promise<unknown> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 401 && !path.startsWith('/auth/')) toLogin();
  if (!res.ok) {
    const e = (await res.json().catch(() => ({ error: res.statusText }))) as ApiError;
    throw new ApiFailure(res.status, e);
  }
  return res.status === 204 ? undefined : res.json();
}

export const api = {
  options: () => call('GET', '/auth/options') as Promise<AuthOptions>,
  me: () => call('GET', '/auth/me') as Promise<Me>,
  login: (c: Credentials) => call('POST', '/auth/login', c) as Promise<Me>,
  register: (c: Credentials) => call('POST', '/auth/register', c) as Promise<Me>,
  logout: () => call('POST', '/auth/logout') as Promise<void>,
  changePassword: (p: PasswordChange) => call('POST', '/auth/password', p) as Promise<void>,

  models: () => call('GET', '/models') as Promise<ModelSummary[]>,
  model: (id: number) => call('GET', `/models/${id}`) as Promise<ModelDoc>,
  create: (m: NewModel) => call('POST', '/models', m) as Promise<Created>,
  save: (id: number, s: Save) => call('PUT', `/models/${id}`, s) as Promise<Saved>,
  revisions: (id: number) => call('GET', `/models/${id}/revisions`) as Promise<RevisionSummary[]>,
  revision: (id: number, rev: number) => call('GET', `/models/${id}/revisions/${rev}`) as Promise<Revision>,
  rename: (id: number, name: string) => call('PATCH', `/models/${id}`, { name }) as Promise<void>,
  remove: (id: number) => call('DELETE', `/models/${id}`) as Promise<void>,
};

/** A failure's message, for showing on the page. */
export function message(e: unknown): string {
  if (e instanceof ApiFailure) return e.message;
  if (e instanceof TypeError) return "Can't reach the server";
  throw e;
}
