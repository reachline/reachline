// Guided edits and the canonical format: what they keep, and what they must
// never do to what a model concludes.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parse } from 'yaml';
import { Model } from '../engine/model.ts';
import { EMPTY } from '../app/src/data.ts';
import {
  addThing,
  applyPlan,
  asElement,
  changes,
  edit,
  overlaps,
  parseParts,
  plansOf,
  prune,
  removeThing,
  renameThing,
  setField,
  written,
  type Edit,
} from '../app/src/edit.ts';
import { format } from '../app/src/format.ts';

const EXAMPLE = readFileSync(new URL('../examples/model.yml', import.meta.url), 'utf8');
const model = (text: string, plans: string[] = []) => new Model({ path: 'model.yml', text }, plans);
const thing = (text: string, id: string, plans: string[] = []) => model(text, plans).things.get(id);

/** Every scenario's verdicts and what each thing is reached with, ids mapped by `as`. */
function results(m: Model, as: (id: string) => string = (id) => id): string[] {
  return [...m.scenarios.keys()].sort().flatMap((name) => {
    const { best } = m.run(name);
    const rows = m.rows(name);
    return [...m.things.keys()]
      .map((t) => `${name} ${as(t)} ${best.get(t)?.a.map(as).join('+') ?? 'no'} ${rows.get(t)?.[0] ?? ''}`)
      .sort();
  });
}

test('the canonical format keeps the data, and formatting twice changes nothing', () => {
  const messy = [
    '# a comment',
    'things:',
    '    a: { kind: device, in: [ home ], note: "x, y" }   # trailing',
    '    home:',
    '        kind: location',
    '        note: >',
    '          folded',
    '          text',
    '    "123": {kind: data, in: ["?"]}',
    '    odd: {kind: data, note: "yes", todo: "- dash", in: [home]}',
    'scenarios:\r\n  baseline: {kind: lockout}',
  ].join('\n');
  for (const text of [EXAMPLE, messy, EMPTY]) {
    const once = format(text);
    assert.deepEqual(parse(once), parse(text));
    assert.equal(format(once), once);
    assert.ok(!once.includes('#'));
  }
  assert.equal(format(EXAMPLE), EXAMPLE, 'the example is kept in the canonical format');
  assert.equal(format(EMPTY), EMPTY);
});

test('a rename changes no verdict but the id, in the model and every plan', () => {
  const renamed = edit(EXAMPLE, renameThing('hw_key', 'yubikey'));
  assert.ok(!/\bhw_key\b/.test(renamed));
  const as = (id: string) => (id === 'hw_key' ? 'yubikey' : id);
  for (const plans of [[], ['spare_key'], ['backup'], ['spare_key', 'backup']]) {
    assert.deepEqual(results(model(renamed, plans)), results(model(EXAMPLE, plans), as));
  }
  assert.throws(() => edit(EXAMPLE, renameThing('hw_key', 'phone')), /taken/);
});

test('applying a plan gives what having it on did', () => {
  for (const plan of ['spare_key', 'backup']) {
    const applied = edit(EXAMPLE, applyPlan(plan));
    assert.deepEqual(results(model(applied)), results(model(EXAMPLE, [plan])));
    assert.ok(!(parse(applied) as { plans: object }).plans[plan as never]);
  }
});

test('removing a thing never widens a way in', () => {
  const access = (p: unknown) => prune('access', p, 'k');
  // Required outright: the way in goes.
  assert.deepEqual(access([['pw', 'k'], ['other']]), [['other']]);
  // One option of several: the others stay, one alone unwrapped.
  assert.deepEqual(access([['pw', ['totp', 'k']]]), [['pw', 'totp']]);
  assert.deepEqual(access([['pw', ['totp', ['k', 'pin'], 'sms']]]), [['pw', ['totp', 'sms']]]);
  // The last option: the step can't be done, so the way in goes.
  assert.deepEqual(access([['pw', ['k']]]), []);
  // Left out of a template, it was never set up: the step isn't asked for.
  assert.deepEqual(prune('access', [['pw', ['k']]], 'k', true), [['pw']]);
  assert.deepEqual(prune('access', [[['k']]], 'k', true), []);
  assert.deepEqual(prune('in', ['k', 'home'], 'k'), ['home']);
  assert.deepEqual(prune('mirrors', { of: 'k', by: 'job' }, 'k'), null);

  const removed = edit(EXAMPLE, removeThing(null, 'hw_key'));
  assert.ok(!/\bhw_key\b/.test(removed));
  for (const plans of [[], ['spare_key'], ['backup']]) model(removed, plans);
  assert.deepEqual(thing(removed, 'mail')!.access, [
    ['mail_pw', 'mail_totp'],
    ['phone_unlocked', 'mail_session_phone'],
  ]);
  assert.deepEqual(thing(removed, 'registrar')!.access, []);
});

test('an edit to a plan goes into the plan, and the model is untouched', () => {
  const text = edit(EXAMPLE, removeThing('backup', 'phone_number'), setField('spare_key', 'bank', 'note', 'n'));
  const base = (t: string) => JSON.stringify((parse(t) as { things: object }).things);
  assert.equal(base(text), base(EXAMPLE));
  assert.equal(thing(text, 'phone_number', ['backup']), undefined);
  assert.deepEqual(thing(text, 'mail', ['backup'])!.recovery, [['mail_codes']]);
  assert.equal(thing(text, 'bank', ['spare_key'])!.note, 'n');
  // Setting a plan's field back to the model's drops it from the plan.
  const back = edit(text, setField('spare_key', 'bank', 'note', thing(EXAMPLE, 'bank')!.note));
  assert.equal(
    (parse(back) as { plans: { spare_key: { things: object } } }).plans.spare_key.things['bank' as never],
    undefined,
  );
});

test('a new thing goes after the last of its kind', () => {
  const edits: Edit[] = [addThing(null, 'tablet', { kind: 'device', in: ['home'] })];
  const ids = Object.keys((parse(edit(EXAMPLE, ...edits)) as { things: object }).things);
  assert.equal(ids[ids.indexOf('tablet') - 1], 'old_drive');
  assert.throws(() => edit(EXAMPLE, addThing(null, 'phone', { kind: 'device' })), /already/);
});

test('parts typed as the CLI writes them', () => {
  assert.deepEqual(parseParts('pw'), [['pw']]);
  assert.deepEqual(parseParts(' a | b + c '), [['a'], ['b', 'c']]);
  assert.equal(parseParts('a |'), null);
  assert.deepEqual(asElement([['a', 'b']]), ['a', 'b']);
  assert.deepEqual(asElement([['a'], ['b', 'c']]), [['a', ['b', 'c']]]);
});

test('a layer reads as written, and its changes field by field', () => {
  const plan = written(EXAMPLE, 'spare_key');
  assert.deepEqual(plan.things.hw_key.in, []);
  assert.equal(written(EXAMPLE, null).things.old_drive.in, '?');
  const after = written(edit(EXAMPLE, removeThing(null, 'hw_key')), null);
  const found = changes(written(EXAMPLE, null), after);
  assert.ok(found.some((c) => c.id === 'hw_key' && c.after === 'removed'));
  assert.ok(found.some((c) => c.id === 'registrar' && c.field === 'access' && c.after === 'none'));
});

test('plans that set the same field are found', () => {
  assert.deepEqual(overlaps(EXAMPLE, ['spare_key', 'backup']), []);
  // The model's value: nothing to set.
  assert.equal(edit(EXAMPLE, setField('backup', 'mail', 'recovery', [['mail_codes'], ['phone_number']])), EXAMPLE);
  const text = edit(EXAMPLE, setField('backup', 'mail', 'recovery', [['phone_number']]));
  assert.deepEqual(overlaps(text, ['spare_key', 'backup']), [{ at: 'mail.recovery', plans: ['spare_key', 'backup'] }]);
  assert.deepEqual(
    plansOf(EXAMPLE).map((p) => p.name),
    ['spare_key', 'backup'],
  );
});
