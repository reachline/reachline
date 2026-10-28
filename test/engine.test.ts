// The engine's behaviour on examples/, and invariants it must keep. Results
// are compared as reach data rather than output text, so they survive changes
// to the file format; only the small inline models are format-specific.
//
//   node --test --test-update-snapshots 'test/*.test.ts'   after a deliberate change
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { stringify } from 'yaml';
import { Model, rank, reach, ReachError, type Best, type Spec } from '../engine/model.ts';

const file = (path: string) => ({ path, text: readFileSync(new URL(`../examples/${path}`, import.meta.url), 'utf8') });
const example = (...plans: string[]) => new Model([file('model.yml'), ...plans.map((p) => file(`plans/${p}.yml`))]);
const docs = (...ds: object[]) => ds.map((d, i) => ({ path: `doc${i}.yml`, text: stringify(d) }));

/** What each scenario reaches and what that relies on, plus its verdicts. */
function results(m: Model): string {
  const out: string[] = [];
  for (const name of [...m.scenarios.keys()].sort()) {
    const { best } = m.run(name);
    const rows = m.rows(name);
    out.push(name);
    for (const t of [...m.things.keys()].sort()) {
      const e = best.get(t);
      const verdict = rows.get(t)?.[0];
      if (!e && verdict === undefined) continue;
      const a = e ? e.a.join(', ') || 'yes' : 'no';
      out.push(`  ${t.padEnd(24)} ${a.padEnd(30)} ${verdict ?? ''}`.trimEnd());
    }
  }
  return out.join('\n') + '\n';
}

const PLAN_SETS = [[], ['spare-key'], ['backup'], ['spare-key', 'backup']];

for (const plans of PLAN_SETS) {
  test(`examples: ${plans.join(' + ') || 'no plans'}`, (t) => {
    t.assert.snapshot(results(example(...plans)), { serializers: [String] });
  });
}

/** The things `b` reaches less well than `a` does. */
function worse(things: Map<string, Spec>, a: Best, b: Best): string[] {
  return [...things.keys()].filter((t) => rank(t, b) > rank(t, a));
}

test('losing more never reaches more', () => {
  for (const m of PLAN_SETS.map((p) => example(...p))) {
    // A mirror survives when its syncer is lost too (tested below), so leave mirrors out.
    const things = new Map([...m.things].map(([t, s]) => [t, { ...s, mirrors: null }]));
    const losses = [[], ...[...m.scenarios.values()].map((sc) => sc.lost ?? [])];
    for (const lost of losses) {
      const before = reach(things, m.me, new Set(lost));
      for (const extra of things.keys()) {
        const after = reach(things, m.me, new Set([...lost, extra]));
        assert.deepEqual(worse(things, after, before), [], `lost ${[...lost, extra].join(', ')}`);
      }
    }
  }
});

test('a mirror empties once its source is lost, unless its syncer is lost too', () => {
  const m = example();
  assert.ok(reach(m.things, m.me, new Set()).has('docs_cloud'));
  assert.ok(!reach(m.things, m.me, new Set(['nas'])).has('docs_cloud'));
  assert.ok(reach(m.things, m.me, new Set(['nas', 'pi'])).has('docs_cloud'));
});

test('an attacker given more never reaches less', () => {
  for (const m of PLAN_SETS.map((p) => example(...p))) {
    const starts = [[], ...[...m.scenarios.values()].map((sc) => sc.attacker ?? [])];
    for (const start of starts) {
      const before = reach(m.things, start, new Set());
      for (const extra of m.things.keys()) {
        const after = reach(m.things, [...start, extra], new Set());
        assert.deepEqual(worse(m.things, before, after), [], `attacker ${[...start, extra].join(', ')}`);
      }
    }
  }
});

test('every path relies on exactly its assumptions and leads back to the start', () => {
  // Listing carrier first makes phone_number's two equal ways in tie the other
  // way, which once showed mail ← phone_number ← carrier ← mail.
  const carrierFirst = docs({ services: { phone_number: { access: [['carrier'], ['phone']] } } })[0];
  const models = [...PLAN_SETS.map((p) => example(...p)), new Model([file('model.yml'), carrierFirst])];
  for (const m of models) {
    for (const name of m.scenarios.keys()) {
      const { best } = m.run(name);
      const placed = new Set<string>();
      const check = (t: string, path: string[]) => {
        assert.ok(!path.includes(t), `${name}: ${[...path, t].join(' ← ')}`);
        if (placed.has(t)) return;
        const { a, why } = best.get(t)!;
        if (why.kind === 'in') {
          assert.deepEqual(best.get(why.via)?.a, a, `${name}: ${t}`);
          check(why.via, [...path, t]);
        } else if (why.kind === 'access' || why.kind === 'recovery') {
          const owner = why.kind === 'access' ? t : `${t}.recovery`;
          const relied = why.uses.flatMap((x) => (x === '?' ? [owner] : best.get(x)!.a));
          assert.deepEqual([...new Set(relied)].sort(), a, `${name}: ${t}`);
          for (const x of why.uses) if (x !== '?') check(x, [...path, t]);
        }
        placed.add(t);
      };
      for (const t of best.keys()) check(t, []);
    }
  }
});

test('a list inside an any-of is a path through all of it', () => {
  const m = example();
  const { why } = reach(m.things, ['code_pw', 'hw_key', 'key_pin'], new Set()).get('code_host')!;
  assert.ok(why.kind === 'access');
  assert.deepEqual([...why.uses].sort(), ['code_pw', 'hw_key', 'key_pin']);
});

test('plans that touch different things commute', () => {
  assert.equal(results(example('spare-key', 'backup')), results(example('backup', 'spare-key')));
});

test('plans apply in order: a later plan replaces the same field', () => {
  const smsBack = docs({ accounts: { mail: { recovery: [['mail_codes'], ['phone_number']] } } })[0];
  const sources = (...plans: { path: string; text: string }[]) => [file('model.yml'), ...plans];
  const thiefReachesMail = (m: Model) => m.run('thief_carried').best.has('mail');
  assert.ok(!thiefReachesMail(example('spare-key')));
  assert.ok(thiefReachesMail(new Model(sources(file('plans/spare-key.yml'), smsBack))));
  assert.ok(!thiefReachesMail(new Model(sources(smsBack, file('plans/spare-key.yml')))));
});

test('a plan can remove a thing, and a later one bring it back', () => {
  const base = { devices: { a: { in: ['home'] }, b: { in: ['home'] } }, locations: { home: {} } };
  const scenarios = { scenarios: { baseline: { kind: 'lockout', lost: [] } }, me: ['home'] };
  const m = (...plans: object[]) => new Model(docs({ ...base, ...scenarios }, ...plans));
  assert.ok(!m({ devices: { b: null } }).things.has('b'));
  assert.ok(m({ devices: { b: null } }, { devices: { b: { in: ['a'] } } }).things.has('b'));
});

test('every reference error is reported', () => {
  const bad = {
    locations: { home: {} },
    states: { s: {} },
    devices: {
      a: {
        in: ['bad_in'],
        needs: ['bad_needs'],
        access: [['bad_access', ['home', 'bad_anyof']]],
        recovery: [['bad_recovery']],
        mirrors: { of: 'bad_of', by: 'bad_by' },
      },
    },
    scenarios: {
      baseline: { kind: 'lockout', lost: ['bad_lost'], assume: ['home'], deny: ['bad_deny'] },
      b: { kind: 'breach', attacker: ['bad_attacker'] },
    },
    me: ['bad_me'],
  };
  assert.throws(
    () => new Model(docs(bad)),
    (e: Error) => {
      assert.ok(e instanceof ReachError);
      const ids = ['in', 'needs', 'access', 'anyof', 'recovery', 'of', 'by', 'lost', 'deny', 'attacker', 'me'];
      for (const id of ids) assert.match(e.message, new RegExp(`\\bbad_${id}\\b`));
      assert.match(e.message, /\bhome\b.*state/, 'assume names a thing that is not a state');
      return true;
    },
  );
});

test('a plan that removes something still referenced is an error', () => {
  const removePhone = docs({ devices: { phone: null } })[0];
  assert.throws(
    () => new Model([file('model.yml'), removePhone]),
    (e: Error) => e instanceof ReachError && e.message.includes('phone'),
  );
});
