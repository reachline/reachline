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
  Reauth,
  Redirect,
  Revision,
  RevisionSummary,
  Save,
  Saved,
  SsoError,
} from '../../server/api.ts';
import { go, toLogin } from './route.svelte.ts';

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
  /** Changes the password, or sets one if there isn't one yet. */
  setPassword: (p: PasswordChange) => call('POST', '/auth/password', p) as Promise<void>,
  removePassword: () => call('DELETE', '/auth/password') as Promise<void>,
  link: () => call('POST', '/auth/oidc/link') as Promise<Redirect>,
  unlink: () => call('DELETE', '/auth/oidc') as Promise<void>,
  deleteAccount: () => call('DELETE', '/auth/me') as Promise<void>,

  models: () => call('GET', '/models') as Promise<ModelSummary[]>,
  model: (id: number) => call('GET', `/models/${id}`) as Promise<ModelDoc>,
  create: (m: NewModel) => call('POST', '/models', m) as Promise<Created>,
  save: (id: number, s: Save) => call('PUT', `/models/${id}`, s) as Promise<Saved>,
  revisions: (id: number) => call('GET', `/models/${id}/revisions`) as Promise<RevisionSummary[]>,
  revision: (id: number, rev: number) => call('GET', `/models/${id}/revisions/${rev}`) as Promise<Revision>,
  rename: (id: number, name: string) => call('PATCH', `/models/${id}`, { name }) as Promise<void>,
  remove: (id: number) => call('DELETE', `/models/${id}`) as Promise<void>,
};

/** Whether the failure says to sign in again first. */
export function needsReauth(e: unknown): boolean {
  return e instanceof ApiFailure && (e.body as Partial<Reauth>).reauth === true;
}

const SSO_PROBLEMS: Record<SsoError, string> = {
  failed: "Signing in with the provider didn't work. Try again; if it keeps failing, the server's log says why.",
  closed: "There's no account here for that identity, and registration is closed.",
  taken: 'That identity is already linked to another account.',
};

/** Why the provider sent the browser back here (?sso=), taken out of the URL so a reload doesn't repeat it. */
export function takeSsoProblem(): string {
  const params = new URLSearchParams(location.search);
  const problem = params.get('sso');
  if (problem === null) return '';
  params.delete('sso');
  go(location.pathname + (params.size ? `?${params}` : ''), true);
  return Object.hasOwn(SSO_PROBLEMS, problem) ? SSO_PROBLEMS[problem as SsoError] : SSO_PROBLEMS.failed;
}

/** A failure's message, for showing on the page. */
export function message(e: unknown): string {
  if (e instanceof ApiFailure) return e.message;
  if (e instanceof TypeError) return "Can't reach the server";
  throw e;
}
