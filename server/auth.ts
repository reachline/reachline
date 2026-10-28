// Password hashing and the limits around it. Every hash costs 19 MiB, so they
// run a few at a time, and a username that keeps failing waits longer each
// time. Neither limit trusts the client's IP, which behind a proxy is a header.
import { argon2, createHash, randomBytes, timingSafeEqual, type Argon2Parameters } from 'node:crypto';
import { promisify } from 'node:util';

const argon2id = promisify(argon2);

// OWASP's minimum, so that a Raspberry Pi can keep up. Hashes made with other
// settings still verify, and are redone at the next login.
const COST = { memory: 19456, passes: 2, parallelism: 1 };
const TAG = 32;

export const USERNAME = /^[a-z0-9._-]{1,32}$/;
export const PASSWORD = { min: 8, max: 128 };

/** Too many hashes already waiting; try again shortly. */
export class Busy extends Error {}

const MAX_RUNNING = 2;
const MAX_WAITING = 32;
let running = 0;
const waiting: (() => void)[] = [];

async function limited<T>(fn: () => Promise<T>): Promise<T> {
  if (running < MAX_RUNNING) running++;
  else if (waiting.length < MAX_WAITING) await new Promise<void>((resolve) => waiting.push(resolve));
  else throw new Busy();
  try {
    return await fn();
  } finally {
    // Hand the slot straight to the next in line, so nothing can jump the queue.
    const next = waiting.shift();
    if (next) next();
    else running--;
  }
}

const b64 = (b: Buffer) => b.toString('base64').replace(/=+$/, '');

/** A PHC string such as $argon2id$v=19$m=19456,t=2,p=1$salt$hash. */
export function hashPassword(password: string): Promise<string> {
  return limited(async () => {
    const nonce = randomBytes(16);
    const tag = await argon2id('argon2id', { message: password, nonce, tagLength: TAG, ...COST });
    return `$argon2id$v=19$m=${COST.memory},t=${COST.passes},p=${COST.parallelism}$${b64(nonce)}$${b64(tag)}`;
  });
}

const PHC = /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/;

export function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const m = PHC.exec(encoded);
  if (!m) return Promise.resolve(false);
  const expected = Buffer.from(m[5], 'base64');
  const params: Argon2Parameters = {
    message: password,
    nonce: Buffer.from(m[4], 'base64'),
    memory: Number(m[1]),
    passes: Number(m[2]),
    parallelism: Number(m[3]),
    tagLength: expected.length,
  };
  return limited(async () => timingSafeEqual(await argon2id('argon2id', params), expected));
}

export function needsRehash(encoded: string): boolean {
  return !encoded.startsWith(`$argon2id$v=19$m=${COST.memory},t=${COST.passes},p=${COST.parallelism}$`);
}

// Verified against when the username doesn't exist, so that takes as long as a wrong password.
let decoy: Promise<string> | undefined;
export function decoyHash(): Promise<string> {
  return (decoy ??= hashPassword(randomBytes(16).toString('hex')));
}

export function randomPassword(): string {
  return randomBytes(15).toString('base64url');
}

/** A new session's cookie value, and the hash of it that the database keeps. */
export function newSessionToken(): { token: string; id: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, id: sessionId(token) };
}

export function sessionId(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

const FREE_FAILURES = 5;
const MAX_DELAY = 15 * 60_000;
const MAX_TRACKED = 10_000;

/** Failed logins per username: after a few, each one doubles the wait, up to 15 minutes. */
export class Throttle {
  #fails = new Map<string, { n: number; until: number }>();

  /** Milliseconds until this username may try again. */
  wait(username: string): number {
    return Math.max(0, (this.#fails.get(username)?.until ?? 0) - Date.now());
  }

  fail(username: string): void {
    const n = (this.#fails.get(username)?.n ?? 0) + 1;
    const until = n < FREE_FAILURES ? 0 : Date.now() + Math.min(1000 * 2 ** (n - FREE_FAILURES), MAX_DELAY);
    this.#fails.delete(username); // re-inserted last, so the oldest go first when full
    this.#fails.set(username, { n, until });
    if (this.#fails.size > MAX_TRACKED) this.#fails.delete(this.#fails.keys().next().value!);
  }

  succeed(username: string): void {
    this.#fails.delete(username);
  }
}
