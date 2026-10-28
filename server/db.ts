// SQLite storage. Every query that touches a model checks it belongs to the
// user, so a route can't forget to. Model text is stored as given, never parsed.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { ModelDoc, ModelSummary, RevisionSummary } from './api.ts';

// Append only: each entry runs once, in order, and pragma user_version counts them.
const MIGRATIONS = [
  `create table users (
     id integer primary key,
     username text not null unique,
     password text, -- an encoded Argon2id hash; null for an account without a password
     created text not null
   );
   create table sessions (
     id text primary key, -- SHA-256 of the cookie's token
     user_id integer not null references users on delete cascade,
     expires text not null
   );
   create table models (
     id integer primary key,
     user_id integer not null references users on delete cascade,
     name text not null,
     updated text not null,
     unique (user_id, name)
   );
   create table revisions (
     id integer primary key,
     model_id integer not null references models on delete cascade,
     text text not null,
     created text not null
   );
   create index revisions_model on revisions (model_id, id);`,
];

/** The store in `dataDir`, created if it's new. */
export function openStore(dataDir: string): Store {
  mkdirSync(dataDir, { recursive: true });
  return new Store(openDb(join(dataDir, 'reachline.db')));
}

export function openDb(file: string): DatabaseSync {
  const db = new DatabaseSync(file);
  db.exec('pragma journal_mode = wal; pragma foreign_keys = on; pragma busy_timeout = 5000');
  const { user_version } = db.prepare('pragma user_version').get() as { user_version: number };
  MIGRATIONS.slice(user_version).forEach((sql, i) =>
    tx(db, () => {
      db.exec(sql);
      db.exec(`pragma user_version = ${user_version + i + 1}`);
    }),
  );
  return db;
}

function tx<T>(db: DatabaseSync, fn: () => T): T {
  db.exec('begin immediate');
  try {
    const out = fn();
    db.exec('commit');
    return out;
  } catch (e) {
    db.exec('rollback');
    throw e;
  }
}

const now = () => new Date().toISOString();

export interface User {
  id: number;
  username: string;
  password: string | null;
}

export interface SessionUser {
  userId: number;
  username: string;
  expires: string;
}

export class Store {
  readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  userCount(): number {
    return (this.db.prepare('select count(*) as n from users').get() as { n: number }).n;
  }

  userByName(username: string): User | undefined {
    return this.db.prepare('select id, username, password from users where username = ?').get(username) as
      User | undefined;
  }

  createUser(username: string, password: string): number {
    const r = this.db
      .prepare('insert into users (username, password, created) values (?, ?, ?)')
      .run(username, password, now());
    return Number(r.lastInsertRowid);
  }

  setPassword(userId: number, password: string): void {
    this.db.prepare('update users set password = ? where id = ?').run(password, userId);
  }

  createSession(id: string, userId: number, expires: string): void {
    this.db.prepare('insert into sessions (id, user_id, expires) values (?, ?, ?)').run(id, userId, expires);
  }

  /** The session's user, if the session exists and hasn't expired. */
  sessionUser(id: string): SessionUser | undefined {
    return this.db
      .prepare(
        `select s.user_id as userId, u.username, s.expires
         from sessions s join users u on u.id = s.user_id
         where s.id = ? and s.expires > ?`,
      )
      .get(id, now()) as SessionUser | undefined;
  }

  extendSession(id: string, expires: string): void {
    this.db.prepare('update sessions set expires = ? where id = ?').run(expires, id);
  }

  deleteSession(id: string): void {
    this.db.prepare('delete from sessions where id = ?').run(id);
  }

  /** Ends every session of the user's except `keep`. */
  deleteSessions(userId: number, keep = ''): void {
    this.db.prepare('delete from sessions where user_id = ? and id != ?').run(userId, keep);
  }

  deleteExpiredSessions(): void {
    this.db.prepare('delete from sessions where expires <= ?').run(now());
  }

  listModels(userId: number): ModelSummary[] {
    return this.db
      .prepare('select id, name, updated from models where user_id = ? order by updated desc')
      .all(userId) as unknown as ModelSummary[];
  }

  /** The id of the user's model with this name. */
  modelNamed(userId: number, name: string): number | undefined {
    const row = this.db.prepare('select id from models where user_id = ? and name = ?').get(userId, name);
    return (row as { id: number } | undefined)?.id;
  }

  createModel(userId: number, name: string, text: string): { id: number; revision: number } {
    return tx(this.db, () => {
      const t = now();
      const r = this.db.prepare('insert into models (user_id, name, updated) values (?, ?, ?)').run(userId, name, t);
      const id = Number(r.lastInsertRowid);
      return { id, revision: this.addRevision(id, text, t) };
    });
  }

  getModel(userId: number, id: number): ModelDoc | undefined {
    return this.db
      .prepare(
        `select m.id, m.name, r.text, r.id as revision
         from models m join revisions r on r.model_id = m.id
         where m.user_id = ? and m.id = ?
         order by r.id desc limit 1`,
      )
      .get(userId, id) as ModelDoc | undefined;
  }

  /** The new revision, or the latest one when `base` isn't it; undefined if there's no such model. */
  saveModel(
    userId: number,
    id: number,
    text: string,
    base: number,
  ): { saved: number } | { latest: number } | undefined {
    return tx(this.db, () => {
      const latest = this.latestRevision(userId, id);
      if (latest === undefined) return undefined;
      if (latest !== base) return { latest };
      const t = now();
      this.db.prepare('update models set updated = ? where id = ?').run(t, id);
      return { saved: this.addRevision(id, text, t) };
    });
  }

  renameModel(userId: number, id: number, name: string): boolean {
    return this.db.prepare('update models set name = ? where user_id = ? and id = ?').run(name, userId, id).changes > 0;
  }

  deleteModel(userId: number, id: number): boolean {
    return this.db.prepare('delete from models where user_id = ? and id = ?').run(userId, id).changes > 0;
  }

  /** Newest first; undefined if there's no such model. */
  listRevisions(userId: number, id: number): RevisionSummary[] | undefined {
    if (this.latestRevision(userId, id) === undefined) return undefined;
    return this.db
      .prepare('select id, created from revisions where model_id = ? order by id desc')
      .all(id) as unknown as RevisionSummary[];
  }

  getRevision(userId: number, id: number, rev: number): string | undefined {
    const row = this.db
      .prepare(
        `select r.text from revisions r join models m on m.id = r.model_id
         where m.user_id = ? and m.id = ? and r.id = ?`,
      )
      .get(userId, id, rev) as { text: string } | undefined;
    return row?.text;
  }

  private latestRevision(userId: number, id: number): number | undefined {
    const row = this.db
      .prepare(
        `select max(r.id) as rev from models m join revisions r on r.model_id = m.id
         where m.user_id = ? and m.id = ?`,
      )
      .get(userId, id) as { rev: number | null };
    return row.rev ?? undefined;
  }

  private addRevision(modelId: number, text: string, created: string): number {
    const r = this.db
      .prepare('insert into revisions (model_id, text, created) values (?, ?, ?)')
      .run(modelId, text, created);
    return Number(r.lastInsertRowid);
  }
}
