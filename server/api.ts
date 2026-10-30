// Request and response bodies of /api, shared by the server and the app. Every
// error is an ApiError; a 409 on save is a Conflict.

export interface ApiError {
  error: string;
}

/** Says the action needs a recent sign-in: sign out and in again, then retry. */
export interface Reauth extends ApiError {
  reauth: true;
}

export interface AuthOptions {
  /** Whether a new account can be made: with a password, or at a first sign-in with the provider. */
  registration: boolean;
  /** Whether users may sign in with a password. */
  password: boolean;
  /** The label of the button to sign in with the provider, if there is one. */
  oidc: string | null;
}

/**
 * Why signing in or linking with the provider failed, as `?sso=` on the page
 * it comes back to: `closed` (no account, and registration is closed), `taken`
 * (another account is linked to that identity) or `failed` (anything else).
 */
export type SsoError = 'failed' | 'closed' | 'taken';

/** Where to send the browser next. */
export interface Redirect {
  url: string;
}

export interface Credentials {
  username: string;
  password: string;
}

export interface Me {
  username: string;
  /** Whether the account has a password. */
  password: boolean;
  /** What the provider calls the identity linked to the account, if one is. */
  linked: string | null;
}

/** `current` is needed unless the account has no password yet. */
export interface PasswordChange {
  current?: string;
  next: string;
}

export interface ModelSummary {
  id: number;
  name: string;
  updated: string;
}

export interface NewModel {
  name: string;
  text: string;
}

export interface Created {
  id: number;
  revision: number;
}

export interface ModelDoc {
  id: number;
  name: string;
  text: string;
  revision: number;
}

/** Saves `text` as a new revision, if the latest is still `base`. */
export interface Save {
  text: string;
  base: number;
}

export interface Saved {
  revision: number;
}

/** Someone saved since `base`: `revision` is the latest. */
export interface Conflict extends ApiError {
  revision: number;
}

export interface Rename {
  name: string;
}

export interface RevisionSummary {
  id: number;
  created: string;
}

export interface Revision {
  text: string;
}
