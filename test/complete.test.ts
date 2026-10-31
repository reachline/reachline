// Id completion in the editor: where it offers ids, and which.
import assert from 'node:assert/strict';
import { test } from 'node:test';
// CodeMirror is the app's dependency, so it's reached through app/.
import { CompletionContext } from '../app/node_modules/@codemirror/autocomplete/dist/index.js';
import { yaml } from '../app/node_modules/@codemirror/lang-yaml/dist/index.js';
import { EditorState } from '../app/node_modules/@codemirror/state/dist/index.js';
import { completeIds, suggest, wordAt } from '../app/src/complete.ts';

const THINGS: [string, string][] = [
  ['home', 'location'],
  ['mail_pw', 'secret'],
  ['at_home', 'state'],
];

/** The ids offered at `|`, or null for none; typing has started unless the word is empty. */
function offered(src: string): string[] | null {
  const pos = src.indexOf('|');
  const state = EditorState.create({ doc: src.replace('|', ''), extensions: [yaml()] });
  const result = completeIds(() => THINGS)(new CompletionContext(state, pos, true));
  return result ? result.options.map((o) => o.label) : null;
}

test('ids are offered in the fields that refer to things', () => {
  const all = THINGS.map(([id]) => id);
  assert.deepEqual(offered('things:\n  a: {kind: device, in: [ho|]}\n'), [...all, 'unknown']);
  assert.deepEqual(offered('things:\n  a:\n    needs: ho|\n'), all);
  assert.deepEqual(offered('things:\n  a:\n    mirrors: {of: ho|, by: x}\n'), all);
  assert.deepEqual(offered('scenarios:\n  s: {kind: lockout, lost: [|]}\n'), all);
  assert.deepEqual(offered('me: [h|, x]\n'), all);
});

test('a list still being typed counts as a list', () => {
  assert.ok(offered('things:\n  a: {kind: device, in: [home, ho|\n')?.includes('home'));
});

test('ids are offered at each word of a condition, quoted or not', () => {
  const all = [...THINGS.map(([id]) => id), 'unknown'];
  assert.deepEqual(offered('things:\n  a:\n    access: mail_pw and (b or ho|\n'), all);
  assert.deepEqual(offered('things:\n  a: {kind: device, recovery: a and (ho|)}\n'), all);
  assert.deepEqual(offered('things:\n  a:\n    access: "a and ho|"\n'), all);
  assert.deepEqual(offered('things:\n  a:\n    access: a and |\n'), all);
});

test('assume and deny are offered states only', () => {
  assert.deepEqual(offered('scenarios:\n  s: {kind: lockout, assume: [a|]}\n'), ['at_home']);
});

test('keys and other fields get nothing', () => {
  assert.equal(offered('things:\n  ho|\n'), null);
  assert.equal(offered('things:\n  a:\n    in: [home]\n    ne|\n'), null);
  assert.equal(offered('things:\n  a: {kind: dev|}\n'), null);
  assert.equal(offered('things:\n  a: {kind: device, note: ho|}\n'), null);
});

test('a condition field completes the word at the caret', () => {
  const text = 'pw and (to';
  assert.deepEqual(wordAt(text, text.length), { from: 8, to: 10 });
  assert.deepEqual(wordAt('pw and ', 7), { from: 7, to: 7 });
  assert.deepEqual(suggest('home', ['at_home', 'home', 'home_safe', 'mail']), ['home_safe', 'at_home']);
});
