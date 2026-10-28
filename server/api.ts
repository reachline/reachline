// Request and response bodies of /api, shared by the server and the app. Every
// error is an ApiError; a 409 on save is a Conflict.

export interface ApiError {
  error: string;
}

export interface AuthOptions {
  registration: boolean;
}

export interface Credentials {
  username: string;
  password: string;
}

export interface Me {
  username: string;
}

export interface PasswordChange {
  current: string;
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
