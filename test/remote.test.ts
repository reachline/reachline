// The command line against a real server: signing in, pull, check and push,
// and what each refuses. Exit codes and the facts in the output, not its wording.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import type { Created, CreatedToken, ModelDoc, RevisionSummary, TokenSummary } from '../server/api.ts';
import { as, server } from './browser.ts';

const CLI = fileURLToPath(new URL('../reachline.ts', import.meta.url));

const BEFORE = `version: 1
me: [home, offsite]
things:
  home: {kind: location}
  offsite: {kind: location}
  laptop: {kind: device, in: [home]}
  mail: {kind: account, check: [lockout], access: laptop}
scenarios:
  fire: {kind: lockout, lost: [home]}
`;
// A backup offsite: the fire no longer locks you out of mail.
const AFTER = BEFORE.replace('access: laptop', 'access: laptop or backup').replace(
  '  mail:',
  '  backup: {kind: device, in: [offsite]}\n  mail:',
);

/** The in-memory app, listening on a port so the CLI can reach it. */
async function listening() {
  const { app, store } = server();
  const http = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const headers = Object.entries(req.headers).flatMap(([k, v]) => (typeof v === 'string' ? [[k, v]] : []));
      void Promise.resolve(
        app.request(req.url!, {
          method: req.method,
          headers: headers as [string, string][],
          body: chunks.length ? Buffer.concat(chunks) : undefined,
        }),
      ).then(async (r) => {
        res.writeHead(r.status, Object.fromEntries(r.headers));
        res.end(Buffer.from(await r.arrayBuffer()));
      });
    });
  });
  await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
  return { app, store, url, close: () => http.close() };
}

/** A directory to work in, with its own config, so nothing here touches yours. */
function workspace() {
  const dir = mkdtempSync(join(tmpdir(), 'reachline-cli-'));
  const env = { ...process.env, XDG_CONFIG_HOME: join(dir, 'config'), REACHLINE_SERVER: '', REACHLINE_TOKEN: '' };
  const run = (args: string[], stdin = '') =>
    new Promise<{ code: number; out: string; err: string }>((resolve) => {
      const child = execFile(process.execPath, [CLI, ...args], { cwd: dir, env }, (e, out, err) =>
        resolve({ code: e ? (typeof e.code === 'number' ? e.code : 1) : 0, out, err }),
      );
      child.stdin!.end(stdin);
    });
  return { dir, run, file: (name: string) => join(dir, name) };
}

async function signedIn() {
  const srv = await listening();
  const alice = await as(srv.app, 'alice');
  const { id } = (await alice.call<Created>('POST', '/api/models', { name: 'home', text: BEFORE })).body;
  const { token } = (await alice.call<CreatedToken>('POST', '/api/auth/tokens', { name: 'laptop' })).body;
  const ws = workspace();
  const login = await ws.run(['login', srv.url], `${token}\n`);
  assert.equal(login.code, 0, login.err);
  assert.match(login.out, /alice/);
  return { ...srv, ...ws, alice, id };
}

test('pull, check and push move an edit to the server, saying what it changes', async (t) => {
  const { run, file, alice, id, url, close } = await signedIn();
  t.after(close);
  const config = join(file('config'), 'reachline', 'config.json');
  assert.equal(statSync(config).mode & 0o777, 0o600, 'only you can read the token');
  assert.equal((JSON.parse(readFileSync(config, 'utf8')) as { server: string }).server, url);

  assert.match((await run(['models'])).out, /^home\b/m);
  assert.equal((await run(['pull', 'home'])).code, 0);
  assert.equal(readFileSync(file('home.yml'), 'utf8'), BEFORE);

  writeFileSync(file('home.yml'), AFTER);
  const check = await run(['check', 'home.yml']);
  assert.equal(check.code, 0, check.err);
  assert.match(check.out, /fire[\s\S]*mail\s+LOST\s+→\s+ok/);

  const push = await run(['push', 'home.yml']);
  assert.equal(push.code, 0, push.err);
  assert.match(push.out, /mail\s+LOST\s+→\s+ok/);
  assert.equal((await alice.call<ModelDoc>('GET', `/api/models/${id}`)).body.text, AFTER);
  const revs = (await alice.call<RevisionSummary[]>('GET', `/api/models/${id}/revisions`)).body;
  assert.equal(revs[0].by, 'laptop');

  // The reports run on the pulled file.
  assert.match((await run(['--model', 'home.yml', 'fire'])).out, /fire/);
});

test('push and pull refuse to lose anyone’s edit', async (t) => {
  const { run, file, alice, id, close } = await signedIn();
  t.after(close);
  await run(['pull', 'home']);
  writeFileSync(file('home.yml'), AFTER);

  // Pulling again would discard the edit.
  const pull = await run(['pull', 'home']);
  assert.equal(pull.code, 1);
  assert.equal(readFileSync(file('home.yml'), 'utf8'), AFTER);

  // Someone saves in the app meanwhile: pushing would overwrite them.
  const doc = (await alice.call<ModelDoc>('GET', `/api/models/${id}`)).body;
  await alice.call('PUT', `/api/models/${id}`, { text: `${BEFORE}# from the app\n`, base: doc.revision });
  const push = await run(['push', 'home.yml']);
  assert.equal(push.code, 1);
  assert.match(push.err, /changed on the server/);
  assert.match((await alice.call<ModelDoc>('GET', `/api/models/${id}`)).body.text, /from the app/);

  assert.equal((await run(['pull', 'home', '--force'])).code, 0);
  assert.match(readFileSync(file('home.yml'), 'utf8'), /from the app/);
});

test('a model with errors isn’t pushed unless forced', async (t) => {
  const { run, file, alice, id, close } = await signedIn();
  t.after(close);
  await run(['pull', 'home']);
  writeFileSync(file('home.yml'), BEFORE.replace('access: laptop', 'access: laptop and nothing_like_it'));

  const check = await run(['check', 'home.yml']);
  assert.equal(check.code, 1);
  assert.match(check.out, /nothing_like_it/);
  const push = await run(['push', 'home.yml']);
  assert.equal(push.code, 1);
  assert.match(push.err, /nothing_like_it/);
  assert.equal((await alice.call<ModelDoc>('GET', `/api/models/${id}`)).body.text, BEFORE);

  assert.equal((await run(['push', 'home.yml', '--force'])).code, 0);
  assert.match((await alice.call<ModelDoc>('GET', `/api/models/${id}`)).body.text, /nothing_like_it/);
});

test('logging out revokes the token, and a wrong token never signs in', async (t) => {
  const { run, url, alice, close } = await signedIn();
  t.after(close);
  assert.equal((await run(['logout'])).code, 0);
  assert.deepEqual((await alice.call<TokenSummary[]>('GET', '/api/auth/tokens')).body, []);
  const after = await run(['models']);
  assert.equal(after.code, 1);
  assert.match(after.err, /Not signed in/);

  const wrong = await run(['login', url], 'rl_not-a-token\n');
  assert.equal(wrong.code, 1);
  assert.equal((await run(['models'])).code, 1);
});
