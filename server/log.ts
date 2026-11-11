// The server's log: one line per event, `time LEVEL message key=value ...`,
// errors and warnings to stderr. Never log secrets, tokens, cookies, request
// bodies, query strings, provider claims, or anything from a model; identify
// users by username.
import { inspect } from 'node:util';

export const LEVELS = ['error', 'warn', 'info', 'debug'] as const;
export type Level = (typeof LEVELS)[number];

type Fields = Record<string, string | number | undefined>;

let threshold = LEVELS.indexOf('info');

export function setLevel(level: Level): void {
  threshold = LEVELS.indexOf(level);
}

// Values can come from requests or the provider, so anything that could break
// the line or forge a field is quoted and escaped.
const value = (v: string | number) => (typeof v === 'number' || /^[\w.,:/@+-]+$/.test(v) ? v : JSON.stringify(v));

function write(level: Level, message: string, fields: Fields = {}, error?: unknown) {
  if (LEVELS.indexOf(level) > threshold) return;
  let line = `${new Date().toISOString()} ${level.toUpperCase()} ${message}`;
  for (const [k, v] of Object.entries(fields)) if (v !== undefined) line += ` ${k}=${value(v)}`;
  if (error !== undefined) line += `\n${inspect(error)}`;
  (level === 'error' || level === 'warn' ? process.stderr : process.stdout).write(line + '\n');
}

export const log = {
  /** Something is broken: a bug, or the server can't run. `error`, if given, is printed in full with its stack. */
  error: (message: string, fields?: Fields, error?: unknown) => write('error', message, fields, error),
  /** Something an admin should look into. */
  warn: (message: string, fields?: Fields) => write('warn', message, fields),
  /** What happened: startup, and changes to accounts and how they sign in. */
  info: (message: string, fields?: Fields) => write('info', message, fields),
  debug: (message: string, fields?: Fields) => write('debug', message, fields),
};
