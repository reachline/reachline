// The CLI end to end: exit codes and error paths, not its exact output. Every
// run names a model, so data/ is never read.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const CLI = fileURLToPath(new URL('../reach.ts', import.meta.url));
const EXAMPLE = fileURLToPath(new URL('../examples/model.yml', import.meta.url));

function run(...args: string[]) {
  const r = spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

function ok(...args: string[]) {
  const r = run('--model', EXAMPLE, ...args);
  assert.equal(r.code, 0, r.err);
  assert.ok(r.out.length > 0);
  return r.out;
}

function fails(args: string[], message: RegExp) {
  const r = run(...args);
  assert.equal(r.code, 1);
  assert.equal(r.out, '');
  assert.match(r.err, message);
}

test('every form runs on the example', () => {
  ok();
  ok('house_fire');
  ok('thief_carried', 'mail');
  ok('nas_dies', 'documents'); // a thing the scenario can't reach
  ok('--todo');
  ok('--plan', 'plans/spare-key.yml', '--plan', 'plans/backup.yml');
  ok('--plan', 'plans/spare-key.yml', 'keys_lost');
  for (const what of ['where', 'all', 'burglary', 'mail']) ok('--mermaid', what);
  ok('--mermaid', 'mail', '--scenario', 'house_fire', '--depth', 'all');
});

test('a plan shows only what it changes', () => {
  const out = ok('--plan', 'plans/spare-key.yml', 'house_fire');
  assert.match(out, /→/);
});

test('errors exit 1 with a message and no output', () => {
  const m = ['--model', EXAMPLE];
  fails([...m, 'no_such_scenario'], /no_such_scenario/);
  fails([...m, 'house_fire', 'no_such_thing'], /no_such_thing/);
  fails([...m, '--plan', 'no_such_plan.yml'], /no_such_plan\.yml: no such file/);
  fails([...m, '--mermaid', 'nothing'], /nothing/);
  fails([...m, '--mermaid', 'mail', '--depth', 'deep'], /--depth/);
  fails([...m, '--mermaid'], /--mermaid needs a value/);
  fails([...m, '--mermaid', 'mail', '--scenario', 'nope'], /nope/);
  fails(['--model', 'no_such_model.yml'], /no such file/);
});

test('a broken model exits 1 and says where', () => {
  const dir = mkdtempSync(join(tmpdir(), 'reach-'));
  const write = (name: string, text: string) => {
    writeFileSync(join(dir, name), text);
    return join(dir, name);
  };
  fails(['--model', write('syntax.yml', 'devices: [unclosed\n')], /syntax\.yml/);
  fails(['--model', write('list.yml', '- a\n')], /list\.yml: expected a mapping/);
  fails(['--model', write('version.yml', 'version: 2\n')], /version 2/);
  fails(['--model', write('refs.yml', 'devices: {a: {in: [nowhere]}}\n')], /nowhere/);
  fails(['--model', write('baseline.yml', 'devices: {a: {}}\n')], /baseline/);
});
