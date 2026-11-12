// The commands that come before the reports: signing in, moving a model
// between your server and a file, checking it, and the docs.
//
// A pulled file has a sidecar beside it (.NAME.yml.reachline) holding where it
// came from and the text it had then, so check can say what an edit changes,
// push can save against the right revision, and pull won't overwrite an edit.
import { renameSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Model, ReachError, type Source } from '../engine/model.ts';
import { todo } from '../engine/report.ts';
import type { Conflict, ModelDoc, ModelSummary, Saved, TokenOwner } from '../server/api.ts';
import { changes, errors } from './check.ts';
import { DOCS, SKILL } from './docs.ts';
import { BUNDLED, call, origin, saveLogin, serverUrl, signedIn } from './server.ts';

export const HELP = `reachline: what you'd lose, or an attacker would reach, when something goes.

Your server
  reachline login URL          sign in, with a token made on the server's Account page
  reachline logout             revoke this computer's token, and forget it
  reachline models             list your models
  reachline pull NAME [FILE]   write a model to NAME.yml, or FILE (--force replaces unpushed edits)
  reachline check FILE         its errors, open todos, and how verdicts changed since the pull
  reachline push FILE          save it as a new revision (--force even with errors)
  reachline update             replace this reachline with your server's

  REACHLINE_SERVER and REACHLINE_TOKEN, if set, are used instead of the login.

Docs
  reachline docs [TOPIC]       the guide to modelling, and the reference
  reachline skill              instructions for an AI agent, as a SKILL.md

Reports on a model file, named by --model FILE
  reachline house_fire           one scenario (none: every scenario)
  reachline burglary mail        how the attacker (or I) reach one thing
  reachline --todo               open questions in the model
  reachline --plan spare_key     before/after for every scenario

--plan names a plan under the model's \`plans:\` and may repeat; plans apply in
order on top of the model, and combine with the other forms (a scenario name,
an explain, --todo) to run against the planned state. A scenario that shares
its name with a command goes after --, as in: reachline --model FILE -- check.
The app draws the graph, and exports it as SVG, PNG or Mermaid.`;

export function read(path: string): Source {
  try {
    return { path, text: readFileSync(path, 'utf8') };
  } catch (e) {
    throw new ReachError(
      `${path}: ${(e as NodeJS.ErrnoException).code === 'ENOENT' ? 'no such file' : (e as Error).message}`,
    );
  }
}

/** Where a pulled file came from, and its text then. */
interface Pulled {
  server: string;
  id: number;
  name: string;
  revision: number;
  base: string;
}

const sidecarOf = (file: string) => join(dirname(file), `.${basename(file)}.reachline`);

function pulled(file: string): Pulled | undefined {
  try {
    return JSON.parse(readFileSync(sidecarOf(file), 'utf8')) as Pulled;
  } catch {
    return undefined;
  }
}

/** Only you can read a model, which maps your weak points. */
const write = (file: string, text: string) => writeFileSync(file, text, { mode: 0o600 });

/** Takes `--force` (or another flag) out of args, saying whether it was there. */
function flag(args: string[], name: string): boolean {
  const i = args.indexOf(name);
  if (i >= 0) args.splice(i, 1);
  return i >= 0;
}

/** The arguments, between min and max of them. */
function expect(args: string[], usage: string, min: number, max = min): string[] {
  if (args.length < min || args.length > max) throw new ReachError(`usage: reachline ${usage}`);
  return args;
}

const indent = (s: string) => s.replace(/^/gm, '  ');

/** How the verdicts changed from the pulled revision to `source`. */
function since(from: Pulled, source: Source): string[] {
  if (source.text === from.base) return [`Unchanged since revision ${from.revision}.`];
  const lines = changes({ path: `revision ${from.revision}`, text: from.base }, source);
  if (lines === null) return [`Revision ${from.revision} doesn't load, so there's nothing to compare with.`];
  if (!lines.length) return [`No verdicts changed since revision ${from.revision}.`];
  return [`Verdicts changed since revision ${from.revision}:`, ...lines];
}

/** Reads a token from the terminal without showing it, or from stdin when that isn't a terminal. */
async function secret(prompt: string): Promise<string> {
  const { stdin, stderr } = process;
  if (!stdin.isTTY) {
    let all = '';
    for await (const chunk of stdin) all += String(chunk);
    return all.split('\n')[0];
  }
  stderr.write(prompt);
  stdin.setRawMode(true);
  stdin.setEncoding('utf8');
  stdin.resume();
  return new Promise((resolve, reject) => {
    let typed = '';
    const finish = () => {
      stdin.off('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
      stderr.write('\n');
    };
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') {
          finish();
          resolve(typed);
          return;
        }
        if (ch === '\u0003') {
          finish();
          reject(new ReachError('Cancelled'));
          return;
        }
        if (ch === '\u007f' || ch === '\b') typed = typed.slice(0, -1);
        else if (ch >= ' ') typed += ch;
      }
    };
    stdin.on('data', onData);
  });
}

type Command = (args: string[]) => string[] | Promise<string[]>;

export const COMMANDS: Record<string, Command> = {
  help: () => [HELP],

  async login(args) {
    const [url] = expect(args, 'login URL', 1);
    const server = origin(url);
    const name = hostname()
      .replace(/\.local$/, '')
      .toLowerCase();
    process.stderr.write(`Make a token for this computer at ${server}/account?new-token=${encodeURIComponent(name)}\n`);
    const token = (await secret('Then paste it here: ')).trim();
    if (!token) throw new ReachError('No token given');
    const r = await call<TokenOwner>({ server, token }, 'GET', '/token', undefined, [401]);
    if (r.status === 401) throw new ReachError(`${server} doesn't know that token: make another, and try again`);
    saveLogin({ server, token });
    return [`Signed in to ${server} as ${r.body.username}, with the token ${r.body.name}.`];
  },

  async logout(args) {
    expect(args, 'logout', 0);
    const login = signedIn();
    let revoked = true;
    try {
      await call(login, 'DELETE', '/token', undefined, [401]);
    } catch (e) {
      if (!(e instanceof ReachError)) throw e;
      revoked = false;
      process.stderr.write(`${e.message}\n`);
    }
    saveLogin(null);
    return revoked
      ? ['Signed out: the token is revoked, and forgotten here.']
      : [`Signed out here, but the token isn't revoked: revoke it on ${login.server}/account.`];
  },

  async models(args) {
    expect(args, 'models', 0);
    const models = (await call<ModelSummary[]>(signedIn(), 'GET', '/models')).body;
    return models.map((m) => `${m.name}  (saved ${m.updated.slice(0, 10)})`);
  },

  async pull(args) {
    const force = flag(args, '--force');
    const [name] = expect(args, 'pull NAME [FILE] [--force]', 1, 2);
    const file = args.at(1) ?? `${name.replace(/[^\w.-]+/g, '-')}.yml`;
    if (existsSync(file) && !force) {
      const was = pulled(file);
      if (!was) throw new ReachError(`${file} already exists (--force replaces it)`);
      if (readFileSync(file, 'utf8') !== was.base)
        throw new ReachError(`${file} has edits that aren't pushed: push them, or --force to discard them`);
    }
    const login = signedIn();
    const models = (await call<ModelSummary[]>(login, 'GET', '/models')).body;
    const found = models.find((m) => m.name === name);
    if (!found) throw new ReachError(`You have no model named ${name} (reachline models lists them)`);
    const doc = (await call<ModelDoc>(login, 'GET', `/models/${found.id}`)).body;
    write(file, doc.text);
    const sidecar: Pulled = {
      server: login.server,
      id: doc.id,
      name: doc.name,
      revision: doc.revision,
      base: doc.text,
    };
    write(sidecarOf(file), JSON.stringify(sidecar, null, 2) + '\n');
    return [`Pulled ${doc.name} (revision ${doc.revision}) to ${file}.`];
  },

  check(args) {
    const [file] = expect(args, 'check FILE', 1);
    const source = read(file);
    const found = errors(source);
    if (found.length) {
      process.exitCode = 1;
      return ['Errors:', ...found.map(indent)];
    }
    const open = todo(new Model(source));
    const from = pulled(file);
    return [
      'No errors.',
      ...(open.length ? ['', 'Todo:', ...open.map(indent)] : []),
      ...(from ? ['', ...since(from, source)] : []),
    ];
  },

  async push(args) {
    const force = flag(args, '--force');
    const [file] = expect(args, 'push FILE [--force]', 1);
    const from = pulled(file);
    if (!from) throw new ReachError(`${file} wasn't pulled from a server: reachline pull NAME first`);
    const login = signedIn();
    if (from.server !== login.server)
      throw new ReachError(`${file} came from ${from.server}, but you're signed in to ${login.server}`);
    const source = read(file);
    if (source.text === from.base) return [`Nothing to push: ${file} is unchanged since revision ${from.revision}.`];
    const found = errors(source);
    if (found.length && !force)
      throw new ReachError(
        [`${file} has errors, so it isn't pushed (--force pushes it anyway):`, ...found.map(indent)].join('\n'),
      );
    const r = await call<Saved | Conflict>(
      login,
      'PUT',
      `/models/${from.id}`,
      { text: source.text, base: from.revision },
      [404, 409],
    );
    if (r.status === 404) throw new ReachError(`${from.name} isn't on ${login.server} any more`);
    if (r.status === 409)
      throw new ReachError(
        `${from.name} changed on the server since you pulled it (it's at revision ${r.body.revision}): ` +
          `copy ${file} aside, pull again, and redo your edit`,
      );
    const { revision } = r.body;
    write(sidecarOf(file), JSON.stringify({ ...from, revision, base: source.text } satisfies Pulled, null, 2) + '\n');
    return [`Saved ${from.name} as revision ${revision}.`, ...(found.length ? [] : ['', ...since(from, source)])];
  },

  async update(args) {
    expect(args, 'update', 0);
    if (!BUNDLED) throw new ReachError('This reachline runs from the repository: update it with git');
    const server = serverUrl();
    if (!server) throw new ReachError('Not signed in: run reachline login https://your.server');
    let text;
    try {
      const res = await fetch(new URL('/reachline.mjs', server));
      text = res.ok ? await res.text() : '';
    } catch (e) {
      throw new ReachError(`Can't reach ${server}: ${(e as Error).message}`);
    }
    if (!text.startsWith('#!/usr/bin/env node')) throw new ReachError(`${server} didn't send reachline`);
    const self = fileURLToPath(import.meta.url);
    if (text === readFileSync(self, 'utf8')) return [`Already the same as ${server}'s.`];
    writeFileSync(`${self}.new`, text, { mode: 0o755 });
    renameSync(`${self}.new`, self);
    return [`Updated reachline from ${server}.`];
  },

  docs(args) {
    expect(args, 'docs [TOPIC]', 0, 1);
    const topic = args.at(0);
    const topics = Object.keys(DOCS).filter((t) => t !== 'index');
    if (topic === undefined)
      return [DOCS.index.trimEnd(), '', `Topics: ${topics.join(', ')}. Read one with: reachline docs TOPIC`];
    if (!Object.hasOwn(DOCS, topic)) throw new ReachError(`No topic ${topic}: try ${topics.join(', ')}`);
    return [DOCS[topic].trimEnd()];
  },

  skill(args) {
    expect(args, 'skill', 0);
    return [SKILL.trimEnd()];
  },
};
