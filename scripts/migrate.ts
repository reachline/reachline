#!/usr/bin/env node
/*
One-off: rewrites a model for facts and conditions (phase 5b), in place.

    node scripts/migrate.ts data/model.yml

- `tags` becomes `check`: critical is lockout, sensitive is breach.
- `needs`, `access` and `recovery` become conditions: `[a, b]` needs is
  `a and b`; access `[[pw, [totp, key]], [codes]]` is
  `(pw and (totp or key)) or codes`. Brackets keep the old nesting exactly.
- `?` becomes `unknown`, and `in: "?"` becomes `in: [unknown]`.
- A `baseline` scenario that only says `kind: lockout` goes, since the normal
  day is built in. One that says more stops the script, so you decide.

Comments survive where the yaml library can keep them; those inside a list
that becomes a condition are lost. Nothing is written unless the result loads,
and each plan with it: on its own, or (for one that builds on another) with
every plan applied.

To check nothing changed, run the old engine before migrating and the new one
after, and compare (`git stash` puts the old engine back for a moment):

    git stash && ./reach.ts > before.txt; ./reach.ts --todo >> before.txt; git stash pop
    node scripts/migrate.ts data/model.yml
    ./reach.ts > after.txt; ./reach.ts --todo >> after.txt
    diff <(sed 's/(?)/(unknown)/g' before.txt) after.txt

The only differences should be in breach rows' `via` (access and recovery are
written as conditions now). Then delete this script.
*/
import { readFileSync, writeFileSync } from 'node:fs';
import { isMap, isScalar, parseDocument, type Document, type YAMLMap } from 'yaml';
import { fmtCond, UNKNOWN, type Cond } from '../engine/cond.ts';
import { Model, ReachError } from '../engine/model.ts';

type Old = string | Old[];

class Stop extends Error {}

const leaf = (x: Old): Cond => {
  if (Array.isArray(x)) throw new Stop(`expected an id, found a list: ${JSON.stringify(x)}`);
  return x === '?' ? UNKNOWN : x;
};
const group = (op: 'and' | 'or', of: Cond[]): Cond => (of.length === 1 ? of[0] : { op, of });
const flat = (x: Old): Old[] => (Array.isArray(x) ? x.flatMap(flat) : [x]);

/** An option of an any-of: an id, or every one of a list's ids. */
const option = (o: Old) => (Array.isArray(o) ? group('and', flat(o).map(leaf)) : leaf(o));
/** An element of an AND-set: an id, `?`, or any one of several options. */
const element = (e: Old) => (Array.isArray(e) ? group('or', e.map(option)) : leaf(e));

function access(v: unknown, where: string): string | null {
  if (v === '?') return UNKNOWN;
  if (!Array.isArray(v)) throw new Stop(`${where}: expected a list of AND-sets`);
  if (!v.length) return null;
  const sets = v.map((s: Old) => {
    if (!Array.isArray(s)) throw new Stop(`${where}: expected a list of AND-sets`);
    if (!s.length) throw new Stop(`${where}: an empty AND-set needs nothing, which a condition can't say`);
    return group('and', s.map(element));
  });
  return fmtCond(group('or', sets));
}

function needs(v: unknown, where: string): string | null {
  if (!Array.isArray(v)) throw new Stop(`${where}: expected a list`);
  return v.length ? fmtCond(group('and', v.map(leaf))) : null;
}

const CHECKS: Record<string, string> = { critical: 'lockout', sensitive: 'breach' };

/** Sets a field in place, so it keeps its place and comments; null removes it from the model, and clears it in a plan. */
function put(doc: Document, map: YAMLMap, key: string, value: unknown, inPlan: boolean) {
  const pair = map.items.find((p) => isScalar(p.key) && p.key.value === key);
  if (!pair) return;
  if (value === null && !inPlan) map.delete(key);
  else pair.value = doc.createNode(value, { flow: true });
}

function migrateLayer(doc: Document, layer: YAMLMap, where: string, inPlan: boolean) {
  const things = layer.get('things', true);
  if (isMap(things)) {
    for (const pair of things.items) {
      const id = String(isScalar(pair.key) ? pair.key.value : pair.key);
      const spec = pair.value;
      if (!isMap(spec)) continue;
      const at = `${where}things.${id}`;
      const js = spec.toJSON() as Record<string, unknown>;
      const tags = spec.items.find((p) => isScalar(p.key) && p.key.value === 'tags');
      if (tags) {
        const values = (Array.isArray(js.tags) ? js.tags : []).map((t: unknown) => {
          if (typeof t !== 'string' || !(t in CHECKS)) throw new Stop(`${at}.tags: unknown tag ${JSON.stringify(t)}`);
          return CHECKS[t];
        });
        tags.key = doc.createNode('check');
        tags.value = doc.createNode(values, { flow: true });
      }
      if (js.in === '?') put(doc, spec, 'in', [UNKNOWN], inPlan);
      else if (Array.isArray(js.in) && js.in.includes('?'))
        put(
          doc,
          spec,
          'in',
          js.in.map((x: unknown) => (x === '?' ? UNKNOWN : x)),
          inPlan,
        );
      if ('needs' in js && js.needs !== null) put(doc, spec, 'needs', needs(js.needs, `${at}.needs`), inPlan);
      for (const key of ['access', 'recovery']) {
        if (key in js && js[key] !== null) put(doc, spec, key, access(js[key], `${at}.${key}`), inPlan);
      }
    }
  }
  const scenarios = layer.get('scenarios', true);
  if (!isMap(scenarios) || !scenarios.has('baseline')) return;
  const baseline = scenarios.get('baseline', true);
  const { kind, lost, ...rest } = (isMap(baseline) ? baseline.toJSON() : {}) as Record<string, unknown>;
  const plain = kind === 'lockout' && (!lost || (Array.isArray(lost) && !lost.length)) && !Object.keys(rest).length;
  if (inPlan || !plain) {
    throw new Stop(
      `${where}scenarios.baseline: the normal day (me, with nothing lost) is built in now, and this one says more ` +
        'than that. Remove it, or make it a scenario of its own under another name, then run this again.',
    );
  }
  scenarios.delete('baseline');
  if (!scenarios.items.length) layer.delete('scenarios');
}

const [path] = process.argv.slice(2);
if (!path) {
  process.stderr.write('usage: node scripts/migrate.ts MODEL.yml\n');
  process.exit(2);
}
const text = readFileSync(path, 'utf8');
const doc = parseDocument(text);
if (doc.errors.length) throw doc.errors[0];
try {
  if (!isMap(doc.contents)) throw new Stop('expected a mapping at the top level');
  migrateLayer(doc, doc.contents, '', false);
  const plans = doc.get('plans', true);
  const names: string[] = [];
  if (isMap(plans)) {
    for (const pair of plans.items) {
      const name = String(isScalar(pair.key) ? pair.key.value : pair.key);
      names.push(name);
      if (isMap(pair.value)) migrateLayer(doc, pair.value, `plans.${name}.`, true);
    }
  }
  const out = doc.toString({ lineWidth: 0, flowCollectionPadding: false });
  const source = { path, text: out };
  new Model(source);
  for (const name of names) {
    try {
      new Model(source, [name]);
    } catch (e) {
      if (!(e instanceof ReachError)) throw e;
      new Model(source, names);
    }
  }
  writeFileSync(path, out);
  process.stdout.write(`migrated ${path}\n`);
} catch (e) {
  if (!(e instanceof Stop || e instanceof ReachError)) throw e;
  process.stderr.write(`${path}: not migrated: ${e.message}\n`);
  process.exitCode = 1;
}
