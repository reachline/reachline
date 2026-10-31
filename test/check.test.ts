// The editor's check: what it marks in the text, and the model it gives.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { check, definitionOf } from '../app/src/check.ts';

const EXAMPLE = readFileSync(new URL('../examples/model.yml', import.meta.url), 'utf8');
const BASE = 'scenarios:\n  baseline: {kind: lockout}\n';

/** The text of each problem's range. */
const marked = (text: string, plans: string[] = []) => check(text, plans).problems.map((p) => text.slice(p.from, p.to));

test('the example checks clean and gives its model', () => {
  const { model, problems } = check(EXAMPLE, ['spare_key']);
  assert.deepEqual(problems, []);
  assert.ok(model?.scenarios.has('keys_lost'));
});

test('a plan that is not in use is still checked, without losing the model', () => {
  const text = EXAMPLE.replace(/^plans:\n/m, 'plans:\n  p:\n    things:\n      hw_key: {kind: device, in: [nope]}\n');
  assert.ok(text !== EXAMPLE);
  const { model, problems } = check(text, []);
  assert.ok(model);
  assert.deepEqual(
    problems.map((p) => text.slice(p.from, p.to)),
    ['nope'],
  );
});

test('a problem in the model is marked once, not once per plan', () => {
  const text = EXAMPLE.replace(/^things:\n/m, 'things:\n  stray: {kind: device, in: [nope]}\n');
  assert.ok(text !== EXAMPLE);
  const { model } = check(text, []);
  assert.equal(model, null);
  assert.deepEqual(marked(text), ['nope']);
});

test('an entry is marked by its key, and its value if that is a scalar', () => {
  assert.deepEqual(marked(`${BASE}things:\n  a: {kind: gadget}\n`), ['kind: gadget']);
  assert.deepEqual(marked(`${BASE}bogus: 1\n`), ['bogus: 1']);
  assert.deepEqual(marked(`${BASE}things:\n  a: {}\n`), ['a']);
  assert.deepEqual(marked(`${BASE}devices:\n  a: {}\n`), ['devices']);
});

test('YAML syntax errors are marked, with no model', () => {
  const { model, problems } = check(`${BASE}things: {a: [\n`, []);
  assert.equal(model, null);
  assert.ok(problems.length > 0);
});

test('a thing is found where it is defined, or in a plan in use that adds it', () => {
  // The line up to the end of the mark: its indent tells things: (2) from a plan (6).
  const at = (id: string, plans: string[] = []) => {
    const r = definitionOf(EXAMPLE, id, plans);
    return r && EXAMPLE.slice(EXAMPLE.lastIndexOf('\n', r[0]) + 1, r[1]);
  };
  assert.equal(at('phone'), '  phone');
  // mail is also changed by spare_key, but it's defined in things.
  assert.equal(at('mail', ['spare_key']), '  mail');
  assert.equal(at('key_offsite'), null);
  assert.equal(at('key_offsite', ['spare_key']), '      key_offsite');
});

test('comments are warned about, since guided edits drop them', () => {
  const text = `# top\n${BASE}things: {a: {kind: device, in: [b, # why\n  c]}}\n`;
  const warned = check(text, []).problems.filter((p) => p.severity === 'warning');
  assert.deepEqual(
    warned.map((p) => text.slice(p.from, p.to)),
    ['# top', '# why'],
  );
});
