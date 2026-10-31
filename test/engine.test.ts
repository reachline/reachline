// The engine's behaviour on examples/, and invariants it must keep. Results
// are compared as reach data rather than output text, so they survive changes
// to the file format; only the small inline models are format-specific.
//
//   node --test --test-update-snapshots 'test/*.test.ts'   after a deliberate change
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { isNode, parse, parseDocument, stringify } from 'yaml';
import { UNKNOWN } from '../engine/cond.ts';
import { Model, rank, reach, ReachError, type Best, type Spec } from '../engine/model.ts';

const EXAMPLE = { path: 'model.yml', text: readFileSync(new URL('../examples/model.yml', import.meta.url), 'utf8') };
const example = (...plans: string[]) => new Model(EXAMPLE, plans);
const doc = (d: object) => ({ path: 'doc.yml', text: stringify(d) });

/** The example with more plans in it. */
function exampleDoc(extra: Record<string, object>) {
  const d = parse(EXAMPLE.text) as { plans: object };
  return doc({ ...d, plans: { ...d.plans, ...extra } });
}
const exampleWith = (extra: Record<string, object>, plans: string[]) => new Model(exampleDoc(extra), plans);

/** Where a model's error marks it (as a dotted path) and the text there: within a condition, its words. */
function marked(source: { path: string; text: string }, plans: string[] = []): { path: string; text: string }[] {
  try {
    new Model(source, plans);
  } catch (e) {
    assert.ok(e instanceof ReachError);
    const d = parseDocument(source.text);
    return e.at.map(({ path, span }) => {
      const node = d.getIn(path, true);
      assert.ok(isNode(node) && node.range, `${path.join('.')} is in the document`);
      const [from, to] = span ?? [0, node.range[1] - node.range[0]];
      return { path: path.join('.'), text: source.text.slice(node.range[0] + from, node.range[0] + to) };
    });
  }
  assert.fail('expected an error');
}

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

const PLAN_SETS = [[], ['spare_key'], ['backup'], ['spare_key', 'backup']];

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
  const carrierFirst = { things: { phone_number: { access: 'carrier or phone' } } };
  const models = [
    ...PLAN_SETS.map((p) => example(...p)),
    exampleWith({ carrier_first: carrierFirst }, ['carrier_first']),
  ];
  for (const m of models) {
    for (const name of m.scenarios.keys()) {
      const { best } = m.run(name);
      const placed = new Set<string>();
      const check = (t: string, path: string[]) => {
        assert.ok(!path.includes(t), `${name}: ${[...path, t].join(' ← ')}`);
        if (placed.has(t)) return;
        const { a, why } = best.get(t)!;
        if (why.kind === 'in' && why.via === UNKNOWN) {
          assert.deepEqual(a, [t], `${name}: ${t}`);
        } else if (why.kind === 'in') {
          assert.deepEqual(best.get(why.via)?.a, a, `${name}: ${t}`);
          check(why.via, [...path, t]);
        } else if (why.kind === 'access' || why.kind === 'recovery') {
          const owner = why.kind === 'access' ? t : `${t}.recovery`;
          const relied = why.uses.flatMap((x) => (x === UNKNOWN ? [owner] : best.get(x)!.a));
          assert.deepEqual([...new Set(relied)].sort(), a, `${name}: ${t}`);
          for (const x of why.uses) if (x !== UNKNOWN) check(x, [...path, t]);
        }
        placed.add(t);
      };
      for (const t of best.keys()) check(t, []);
    }
  }
});

test('an and inside an or is a path through all of it', () => {
  const m = example();
  const { why } = reach(m.things, ['code_pw', 'hw_key', 'key_pin'], new Set()).get('code_host')!;
  assert.ok(why.kind === 'access');
  assert.deepEqual([...why.uses].sort(), ['code_pw', 'hw_key', 'key_pin']);
});

test('plans that touch different things commute', () => {
  assert.equal(results(example('spare_key', 'backup')), results(example('backup', 'spare_key')));
});

test('plans apply in order: a later plan replaces the same field', () => {
  const smsBack = { sms_back: { things: { mail: { recovery: 'mail_codes or phone_number' } } } };
  const thiefReachesMail = (m: Model) => m.run('thief_carried').best.has('mail');
  assert.ok(!thiefReachesMail(example('spare_key')));
  assert.ok(thiefReachesMail(exampleWith(smsBack, ['spare_key', 'sms_back'])));
  assert.ok(!thiefReachesMail(exampleWith(smsBack, ['sms_back', 'spare_key'])));
});

test('a plan can remove a thing, and a later one bring it back', () => {
  const m = (...plans: string[]) =>
    new Model(
      doc({
        things: {
          home: { kind: 'location' },
          a: { kind: 'device', in: ['home'] },
          b: { kind: 'device', in: ['home'] },
        },
        me: ['home'],
        plans: { drop: { things: { b: null } }, back: { things: { b: { kind: 'device', in: ['a'] } } } },
      }),
      plans,
    );
  assert.ok(!m('drop').things.has('b'));
  assert.ok(m('drop', 'back').things.has('b'));
});

test('every reference error is reported', () => {
  const bad = {
    things: {
      home: { kind: 'location' },
      s: { kind: 'state' },
      a: {
        kind: 'device',
        in: ['bad_in'],
        needs: 'home and bad_needs',
        access: 'bad_access and (home or bad_anyof)',
        recovery: 'bad_recovery',
        mirrors: { of: 'bad_of', by: 'bad_by' },
      },
    },
    scenarios: {
      fire: { kind: 'lockout', lost: ['bad_lost'], assume: ['home'], deny: ['bad_deny'] },
      b: { kind: 'breach', attacker: ['bad_attacker'] },
    },
    me: ['bad_me'],
  };
  const ids = ['in', 'needs', 'access', 'anyof', 'recovery', 'of', 'by', 'lost', 'deny', 'attacker', 'me'];
  assert.throws(
    () => new Model(doc(bad)),
    (e: Error) => {
      assert.ok(e instanceof ReachError);
      for (const id of ids) assert.match(e.message, new RegExp(`\\bbad_${id}\\b`));
      assert.match(e.message, /\bhome\b.*state/, 'assume names a thing that is not a state');
      return true;
    },
  );
  assert.deepEqual(
    marked(doc(bad))
      .map((m) => m.text)
      .sort(),
    [...ids.map((id) => `bad_${id}`), 'home'].sort(),
  );
});

test('a plan that removes something still referenced is an error', () => {
  assert.throws(
    () => exampleWith({ no_phone: { things: { phone: null } } }, ['no_phone']),
    (e: Error) => e instanceof ReachError && e.message.includes('phone'),
  );
});

test('kinds, checks and keys are closed sets, and kind is required', () => {
  const fails = (d: object, ...words: string[]) =>
    assert.throws(
      () => new Model(doc(d)),
      (e: Error) => e instanceof ReachError && words.every((w) => e.message.includes(w)),
      JSON.stringify(d),
    );
  fails({ things: { a: {} } }, 'a', 'kind');
  fails({ things: { a: { kind: 'gadget' } } }, 'a', 'gadget');
  fails({ things: { a: { kind: 'device', check: ['lockut'] } } }, 'a', 'lockut');
  fails({ things: { a: { kind: 'device', tags: ['critical'] } } }, 'a', 'tags');
  fails({ devices: { a: {} } }, 'devices');
  fails({ things: { a: { kind: 'device', recovry: [] } } }, 'a', 'recovry');
  fails({ things: { a: { kind: 'device', mirrors: { of: 'a', bye: 'a' } } } }, 'a', 'bye');
  fails({ scenarios: { fire: { kind: 'lockout', lots: [] } } }, 'fire', 'lots');
  // A misspelled scenario kind used to run as a breach.
  fails({ scenarios: { fire: { kind: 'lockut' } } }, 'fire', 'kind');
  fails({ scenarios: { fire: {} } }, 'fire', 'kind');
  assert.throws(() => exampleWith({ p: { version: 1 } }, ['p']), /version/);
  // A plan adding a thing must give its kind; one changing a thing needn't.
  assert.throws(() => exampleWith({ p: { things: { new_key: { in: ['home'] } } } }, ['p']), /new_key/);
  assert.ok(example('spare_key').things.get('hw_key')!.kind === 'device');
});

test('errors mark where the problem is written, in the model or a plan', () => {
  const base = {};
  const one = (source: { path: string; text: string }, plans: string[], path: string, text?: string) => {
    const marks = marked(source, plans);
    assert.equal(marks.length, 1, path);
    assert.equal(marks[0].path, path);
    if (text !== undefined) assert.equal(marks[0].text, text);
  };
  one(doc({ ...base, devices: {} }), [], 'devices');
  one(doc({ ...base, things: { a: {} } }), [], 'things.a');
  one(doc({ ...base, things: { a: { kind: 'gadget' } } }), [], 'things.a.kind', 'gadget');
  one(doc({ ...base, things: { a: { kind: 'device', check: ['lockout', 'lockut'] } } }), [], 'things.a.check.1');
  one(doc({ ...base, things: { a: { kind: 'device', recovry: [] } } }), [], 'things.a.recovry');
  one(doc({ scenarios: { fire: { kind: 'lockut' } } }), [], 'scenarios.fire.kind', 'lockut');
  one(
    exampleDoc({ p: { scenarios: { s: { kind: 'breach', attackers: [] } } } }),
    ['p'],
    'plans.p.scenarios.s.attackers',
  );
  one(exampleDoc({ p: { thingz: {} } }), ['p'], 'plans.p.thingz');
  one(exampleDoc({ p: { things: { new_key: { in: ['home'] } } } }), ['p'], 'plans.p.things.new_key');

  // A plan's own reference is marked in the plan; one it breaks, where it's written.
  const marks = marked(exampleDoc({ p: { things: { hw_key: { access: 'key_pin and nope' }, phone: null } } }), ['p']);
  assert.ok(marks.some((m) => m.path === 'plans.p.things.hw_key.access' && m.text === 'nope'));
  const phone = marks.filter((m) => m.text === 'phone');
  assert.ok(phone.length > 0 && phone.every((m) => m.path.startsWith('things.')));
});

test('plans are chosen by name from the model', () => {
  assert.throws(() => example('spare_key', 'nope'), /nope/);
  assert.ok(example('spare_key').scenarios.has('keys_lost'));
  assert.ok(!example().scenarios.has('keys_lost'));
});

test('a condition that does not parse is marked on the word, and says how to fix it', () => {
  const at = (access: string) => {
    const marks = marked(doc({ things: { a: { kind: 'device', access } } }));
    assert.equal(marks.length, 1, access);
    return marks[0].text;
  };
  assert.equal(at('a and b or c'), 'or');
  assert.equal(at('a and (b or c'), '(');
  assert.equal(at('a and b)'), ')');
  assert.equal(at('a b'), 'b');
  assert.equal(at('a and'), 'and');
  assert.equal(at('(a or ?)'), '?');
  assert.throws(
    () => new Model(doc({ things: { a: { kind: 'device', access: 'x and y or z' } } })),
    /\(x and y\) or z/,
  );
  // A list was the old shape; a condition is one string.
  assert.throws(() => new Model(doc({ things: { a: { kind: 'device', needs: ['a'] } } })), /needs must be a condition/);
});

test('unknown is a place in in and an assumption in access, but means nothing in needs or a scenario', () => {
  const things = { home: { kind: 'location' }, a: { kind: 'device', in: ['home', UNKNOWN] } };
  const m = new Model(doc({ things, scenarios: { fire: { kind: 'lockout', lost: ['home'] } }, me: ['home'] }));
  assert.deepEqual(m.run('baseline').best.get('a')!.a, []);
  // Once home is lost, it's somewhere you don't know: never lost, reached only by assuming it.
  assert.deepEqual(m.run('fire').best.get('a')!.a, ['a']);
  const fails = (d: object, text: string) =>
    assert.deepEqual(
      marked(doc(d)).map((x) => x.text),
      [text],
    );
  fails({ things: { a: { kind: 'device', needs: `a and ${UNKNOWN}` } } }, UNKNOWN);
  fails({ things: { a: { kind: 'device', in: ['?'] } } }, '"?"');
  fails({ things: { a: { kind: 'device' } }, scenarios: { s: { kind: 'lockout', lost: [UNKNOWN] } } }, UNKNOWN);
  assert.equal(marked(doc({ things: { [UNKNOWN]: { kind: 'device' } } }))[0].path, `things.${UNKNOWN}`);
});

test('needs can say what is redundant', () => {
  const m = new Model(
    doc({
      things: {
        vm: { kind: 'device' },
        proxy_a: { kind: 'device' },
        proxy_b: { kind: 'device' },
        site: { kind: 'service', needs: 'vm and (proxy_a or proxy_b)' },
      },
      me: ['vm', 'proxy_a', 'proxy_b', 'site'],
    }),
  );
  const has = (lost: string[]) => reach(m.things, m.me, new Set(lost)).has('site');
  assert.ok(has(['proxy_a']));
  assert.ok(!has(['proxy_a', 'proxy_b']));
  assert.ok(!has(['vm']));
});

test('the normal day is built in, first, and can not be written', () => {
  const m = example();
  assert.equal([...m.scenarios.keys()][0], 'baseline');
  assert.deepEqual(m.scenario('baseline'), { kind: 'lockout' });
  assert.equal(marked(doc({ scenarios: { baseline: { kind: 'lockout' } } }))[0].path, 'scenarios.baseline');
  assert.throws(() => exampleWith({ p: { scenarios: { baseline: { kind: 'lockout' } } } }, ['p']), /built in/);
});
