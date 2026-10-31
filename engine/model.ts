// The model and the reach engine, ported from the original reach.py. Nothing here
// touches the filesystem, so it runs in the browser as well as the CLI.
import { parse } from 'yaml';
import { CondError, fmtCond, holds, parseCond, RESERVED, split, UNKNOWN, words, type Cond } from './cond.ts';

/** What a thing is. Only `state` changes how the engine treats it. */
export const KINDS = ['location', 'device', 'state', 'secret', 'service', 'data', 'account'] as const;
export type Kind = (typeof KINDS)[number];

/** What a thing is checked for. Closed, so a misspelling can't silently drop it from every check. */
export const CHECKS = ['lockout', 'breach'] as const;
export type Check = (typeof CHECKS)[number];

/** The format version a file may declare with a top-level `version:` (optional). */
export const VERSION = 1;

/** The fields that hold a condition. */
export const CONDITIONS = ['needs', 'access', 'recovery'] as const;

export interface Spec {
  kind: Kind;
  check: Check[];
  /** Places, any of which reaches it; `unknown` is one you don't know. */
  in: string[];
  needs: Cond | null;
  access: Cond | null;
  recovery: Cond | null;
  mirrors: { of: string; by: string } | null;
  note?: unknown;
  todo?: unknown;
  [field: string]: unknown;
}

export interface Scenario {
  kind: (typeof SCENARIO_KINDS)[number];
  lost?: string[];
  attacker?: string[];
  assume?: string[];
  deny?: string[];
  note?: string;
  [field: string]: unknown;
}

/** Unknowns and states a path relies on: sorted, no duplicates. Empty = outright. */
export type Assumptions = readonly string[];

export type Why =
  | { kind: 'start' }
  | { kind: 'state' }
  | { kind: 'in'; via: string }
  // via: the top-level `or` option taken; uses: the ids it takes, one option per `or` (or `unknown`).
  | { kind: 'access' | 'recovery'; via: Cond; uses: string[] };

export interface Entry {
  a: Assumptions;
  why: Why;
}

/** Everything reached: id -> the path with the fewest assumptions. */
export type Best = Map<string, Entry>;

/** A key path into the document, such as ['things', 'mail', 'access', 0]. */
export type Path = (string | number)[];

/** A problem in the model or the command line; the CLI prints it and exits 1. */
export class ReachError extends Error {
  /** Where in the document each problem is, for an editor to mark; empty when it isn't in the document. */
  readonly at: Located[];

  constructor(message: string, at: Located[] = []) {
    super(message);
    this.at = at;
  }
}

/** A problem at a path, and for a condition, where in its text (`span`, as offsets into the string). */
export interface Located {
  path: Path;
  message: string;
  span?: [number, number];
}

/** An error at one place in the document. */
const fault = (path: Path, message: string, span?: [number, number]) =>
  new ReachError(message, [{ path, message, ...(span && { span }) }]);

/**
 * Where a merged thing or scenario came from. Plans replace whole fields, so
 * each field has a single source: the base model or one plan.
 */
interface Origin {
  at: Path;
  fields: Record<string, Path>;
}

const merged = (prev: Origin | undefined, spec: Raw, at: Path): Origin => ({
  at,
  fields: { ...prev?.fields, ...Object.fromEntries(Object.keys(spec).map((k) => [k, [...at, k]])) },
});

const fieldAt = (o: Origin, field: string): Path => o.fields[field] ?? o.at;

export interface Source {
  path: string;
  text: string;
}

type Raw = Record<string, unknown>;
const isMap = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v);
const entries = (v: unknown): [string, unknown][] => (isMap(v) ? Object.entries(v) : []);

const KEYS = {
  model: ['version', 'things', 'scenarios', 'me', 'plans'],
  plan: ['note', 'things', 'scenarios', 'me'],
  thing: ['kind', 'check', 'in', 'needs', 'access', 'recovery', 'mirrors', 'note', 'todo'],
  mirrors: ['of', 'by'],
  scenario: ['kind', 'lost', 'attacker', 'assume', 'deny', 'note'],
};

export const SCENARIO_KINDS = ['lockout', 'breach'] as const;

/**
 * The normal day: you with `me`, nothing lost, no states pinned. It's built
 * in, first among the scenarios, and every lockout is reported against it.
 */
export const BASELINE = 'baseline';
const NORMAL_DAY: Scenario = { kind: 'lockout' };

function checkKeys(layer: Raw, allowed: string[], where: string, at: Path) {
  for (const key of Object.keys(layer)) {
    if (!allowed.includes(key))
      throw fault([...at, key], `${where}: unknown key: ${key} (expected ${allowed.join(', ')})`);
  }
}

/** Load a model with the named plans applied in order. Plans replace whole fields. */
export function load(
  { path, text }: Source,
  plans: string[] = [],
): { things: Map<string, Spec>; scenarios: Map<string, Scenario>; me: string[] } {
  let doc: unknown;
  try {
    doc = parse(text) ?? {};
  } catch (e) {
    throw new ReachError(`${path}: ${(e as Error).message}`);
  }
  if (!isMap(doc)) throw new ReachError(`${path}: expected a mapping at the top level`);
  checkKeys(doc, KEYS.model, path, []);
  if ('version' in doc && doc.version !== VERSION) {
    throw fault(['version'], `${path}: format version ${String(doc.version)} (this engine reads version ${VERSION})`);
  }
  const layers: [Raw, string, Path][] = [[doc, path, []]];
  const named = new Map(entries(doc.plans));
  for (const name of plans) {
    const plan = named.get(name);
    if (!named.has(name)) {
      const have = [...named.keys()].join(', ') || 'none';
      throw new ReachError(`unknown plan: ${name} (have ${have})`);
    }
    if (!isMap(plan)) throw fault(['plans', name], `${path}: plan ${name}: expected a mapping`);
    checkKeys(plan, KEYS.plan, `${path}: plan ${name}`, ['plans', name]);
    layers.push([plan, `${path}: plan ${name}`, ['plans', name]]);
  }

  const raw = new Map<string, Raw>();
  const scenarios = new Map<string, Scenario>();
  let me: unknown = null;
  const from: From = { things: new Map(), scenarios: new Map(), me: ['me'] };
  layers.forEach(([layer, where, prefix], i) => {
    for (const [tid, spec] of entries(layer.things)) {
      const at = [...prefix, 'things', tid];
      if (RESERVED.includes(tid))
        throw fault(at, `${where}: ${tid}: ${RESERVED.join(', ')} are words of a condition, not ids`);
      if (spec !== null && !isMap(spec)) throw fault(at, `${where}: ${tid}: expected a mapping`);
      if (spec) checkKeys(spec, KEYS.thing, `${where}: ${tid}`, at);
      if (isMap(spec?.mirrors)) checkKeys(spec.mirrors, KEYS.mirrors, `${where}: ${tid}: mirrors`, [...at, 'mirrors']);
      if (i && spec === null) {
        raw.delete(tid);
        from.things.delete(tid);
      } else {
        raw.set(tid, { ...raw.get(tid), ...spec });
        from.things.set(tid, merged(from.things.get(tid), spec ?? {}, at));
      }
    }
    for (const [name, sc] of entries(layer.scenarios)) {
      const at = [...prefix, 'scenarios', name];
      if (name === BASELINE) {
        throw fault(
          at,
          `${where}: scenario ${BASELINE}: the normal day is built in (me, with nothing lost); remove this`,
        );
      }
      if (sc === null) {
        scenarios.delete(name);
        from.scenarios.delete(name);
      } else if (isMap(sc)) {
        checkKeys(sc, KEYS.scenario, `${where}: scenario ${name}`, at);
        scenarios.set(name, { ...scenarios.get(name), ...sc } as Scenario);
        from.scenarios.set(name, merged(from.scenarios.get(name), sc, at));
      } else throw fault(at, `${where}: scenario ${name}: expected a mapping`);
    }
    if ('me' in layer) {
      me = layer.me;
      from.me = [...prefix, 'me'];
    }
  });
  const things = new Map([...raw].map(([tid, spec]) => [tid, normalize(tid, spec, from.things.get(tid)!)]));
  for (const [name, sc] of scenarios) {
    if (!oneOf(sc.kind, SCENARIO_KINDS)) {
      const o = from.scenarios.get(name)!;
      throw fault(
        'kind' in sc ? fieldAt(o, 'kind') : o.at,
        `${path}: scenario ${name}: kind must be ${SCENARIO_KINDS.join(' or ')}`,
      );
    }
  }
  const meList = Array.isArray(me) ? me.map(String) : [];
  validate(things, raw, scenarios, meList, from);
  return { things, scenarios: new Map([[BASELINE, NORMAL_DAY], ...scenarios]), me: meList };
}

/** Where everything that was merged came from. */
interface From {
  things: Map<string, Origin>;
  scenarios: Map<string, Origin>;
  me: Path;
}

const oneOf = (v: unknown, set: readonly string[]) => typeof v === 'string' && set.includes(v);

function normalize(tid: string, raw: Raw, from: Origin): Spec {
  const spec: Raw = { ...raw };
  if (spec.kind === undefined) throw fault(from.at, `${tid}: kind is required (one of ${KINDS.join(', ')})`);
  if (!oneOf(spec.kind, KINDS)) {
    throw fault(
      fieldAt(from, 'kind'),
      `${tid}: unknown kind: ${JSON.stringify(spec.kind)} (expected one of ${KINDS.join(', ')})`,
    );
  }
  for (const key of ['check', 'in']) {
    spec[key] ??= [];
    if (!Array.isArray(spec[key])) throw fault(fieldAt(from, key), `${tid}: ${key} must be a list`);
  }
  for (const [i, c] of (spec.check as unknown[]).entries()) {
    if (!oneOf(c, CHECKS)) {
      throw fault(
        [...fieldAt(from, 'check'), i],
        `${tid}: unknown check: ${JSON.stringify(c)} (expected ${CHECKS.join(' or ')})`,
      );
    }
  }
  for (const key of CONDITIONS) {
    const v = spec[key] ?? null;
    const at = fieldAt(from, key);
    if (v !== null && typeof v !== 'string') {
      throw fault(at, `${tid}: ${key} must be a condition, such as: a and (b or c)`);
    }
    try {
      spec[key] = v === null ? null : parseCond(v);
    } catch (e) {
      if (!(e instanceof CondError)) throw e;
      throw fault(at, `${tid}: ${key}: ${e.message}`, [e.from, e.to]);
    }
  }
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- any falsy value means none
  spec.mirrors = spec.mirrors || null;
  return spec as Spec;
}

/** The ids in a list or condition as written, with where each is: a list's index, or a condition's span. */
function located(v: unknown, at: Path): { id: string; path: Path; span?: [number, number] }[] {
  if (Array.isArray(v)) return v.map((id, i) => ({ id: String(id), path: [...at, i] }));
  if (typeof v === 'string') return words(v).map((w) => ({ id: w.text, path: at, span: [w.from, w.to] }));
  return [];
}

function validate(
  things: Map<string, Spec>,
  raw: Map<string, Raw>,
  scenarios: Map<string, Scenario>,
  me: string[],
  from: From,
) {
  const bad: { line: string; path: Path; message: string; span?: [number, number] }[] = [];
  const unknown = (owner: string, r: string, path: Path, span?: [number, number]) =>
    bad.push({ line: `${owner}: ${r}`, path, message: `unknown reference: ${r}`, ...(span && { span }) });
  // `unknown` is a place in `in`, and an assumption in access and recovery; elsewhere it means nothing.
  const misplaced = (owner: string, key: string, r: string, path: Path, span?: [number, number]) => {
    const message = r === '?' ? 'write unknown, not ?' : `${r} can't be in ${key}`;
    bad.push({ line: `${owner}: ${r} (${message})`, path, message, ...(span && { span }) });
  };
  const allows = (key: string) => key === 'in' || key === 'access' || key === 'recovery';
  for (const [tid, spec] of things) {
    const o = from.things.get(tid)!;
    for (const key of ['in', ...CONDITIONS]) {
      for (const { id, path, span } of located(raw.get(tid)![key], fieldAt(o, key))) {
        if (id === '?' || (id === UNKNOWN && !allows(key))) misplaced(tid, key, id, path, span);
        else if (id !== UNKNOWN && !things.has(id)) unknown(tid, id, path, span);
      }
    }
    if (spec.mirrors) {
      const at = fieldAt(o, 'mirrors');
      if (!things.has(spec.mirrors.of)) unknown(tid, spec.mirrors.of, [...at, 'of']);
      if (!things.has(spec.mirrors.by)) unknown(tid, spec.mirrors.by, [...at, 'by']);
    }
  }
  for (const [name, sc] of scenarios) {
    const o = from.scenarios.get(name)!;
    for (const key of ['lost', 'attacker'] as const) {
      for (const [i, r] of [...(sc[key] ?? [])].entries()) {
        if (r === UNKNOWN || r === '?') misplaced(name, key, r, [...fieldAt(o, key), i]);
        else if (!things.has(r)) unknown(name, r, [...fieldAt(o, key), i]);
      }
    }
    for (const key of ['assume', 'deny'] as const) {
      for (const [i, r] of [...(sc[key] ?? [])].entries()) {
        if (things.get(r)?.kind !== 'state') {
          bad.push({
            line: `${name}: ${r} (not a state)`,
            path: [...fieldAt(o, key), i],
            message: `not a state: ${r}`,
          });
        }
      }
    }
  }
  for (const [i, r] of me.entries()) {
    if (r === UNKNOWN || r === '?') misplaced('me', 'me', r, [...from.me, i]);
    else if (!things.has(r)) unknown('me', r, [...from.me, i]);
  }
  if (bad.length) {
    throw new ReachError(
      'unknown references:\n' + bad.map((b) => `  ${b.line}`).join('\n'),
      bad.map(({ path, message, span }) => ({ path, message, ...(span && { span }) })),
    );
  }
}

/** What still exists, after needs, in, and mirrors that sync a loss. */
export function availability(things: Map<string, Spec>, lost: Set<string>): Map<string, boolean> {
  const memo = new Map<string, boolean>();
  const avail = (tid: string, stack: readonly string[]): boolean => {
    const known = memo.get(tid);
    if (known !== undefined) return known;
    if (stack.includes(tid)) return true;
    const spec = things.get(tid)!;
    const st = [...stack, tid];
    // A place you don't know is never lost.
    let ok =
      !lost.has(tid) &&
      (spec.needs === null || holds(spec.needs, (n) => avail(n, st))) &&
      (spec.in.length === 0 || spec.in.some((c) => c === UNKNOWN || avail(c, st)));
    // A mirror follows its source: once the source is gone, the next sync
    // empties it, as long as whatever runs the sync is still running.
    const mir = spec.mirrors;
    if (ok && mir && !avail(mir.of, st) && avail(mir.by, st)) ok = false;
    memo.set(tid, ok);
    return ok;
  };
  return new Map([...things.keys()].map((tid) => [tid, avail(tid, [])]));
}

function union(...sets: Assumptions[]): Assumptions {
  return [...new Set(sets.flat())].sort();
}

interface Use {
  a: Assumptions;
  uses: string[];
}

/** What a condition relies on and uses, or null if it can't be reached. An
 *  `or` takes the option with the fewest assumptions, the first listed on a
 *  tie; `unknown` is an assumption about its owner. */
function use(c: Cond, best: Best, owner: string): Use | null {
  if (typeof c === 'string') {
    const a = c === UNKNOWN ? [owner] : best.get(c)?.a;
    return a ? { a, uses: [c] } : null;
  }
  if (c.op === 'and') {
    const parts: Use[] = [];
    for (const x of c.of) {
      const u = use(x, best, owner);
      if (!u) return null;
      parts.push(u);
    }
    return { a: union(...parts.map((p) => p.a)), uses: [...new Set(parts.flatMap((p) => p.uses))] };
  }
  let min: Use | null = null;
  for (const x of c.of) {
    const u = use(x, best, owner);
    if (u && (!min || u.a.length < min.a.length)) min = u;
  }
  return min;
}

const KIND_ORDER = { start: 0, state: 0, in: 1, access: 2, recovery: 3 };

function cmpStrings(a: readonly string[], b: readonly string[]): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  return a.length - b.length;
}

/** Fewest unknowns wins; on a tie, prefer in > access > recovery. */
function cmpEntry(x: Entry, y: Entry): number {
  return x.a.length - y.a.length || KIND_ORDER[x.why.kind] - KIND_ORDER[y.why.kind] || cmpStrings(x.a, y.a);
}

/** The best entry, the first listed on a tie. */
const bestOf = (cands: Entry[]): Entry | undefined =>
  cands.length ? cands.reduce((m, c) => (cmpEntry(c, m) < 0 ? c : m)) : undefined;

function sameEntry(x: Entry, y: Entry): boolean {
  return (
    x.why.kind === y.why.kind &&
    ('via' in x.why ? x.why.via === (y.why as typeof x.why).via : true) &&
    cmpStrings(x.a, y.a) === 0
  );
}

const START: Why = { kind: 'start' };
const STATE: Why = { kind: 'state' };

/** Each way into tid that `best` reaches, in the order the model lists them. */
function candidates(tid: string, spec: Spec, best: Best): Entry[] {
  const cands: Entry[] = [];
  for (const c of spec.in) {
    const a = c === UNKNOWN ? [tid] : best.get(c)?.a;
    if (a) cands.push({ a, why: { kind: 'in', via: c } });
  }
  for (const kind of ['access', 'recovery'] as const) {
    const owner = kind === 'access' ? tid : `${tid}.recovery`;
    // Each top-level option is a way in of its own.
    const cond = spec[kind];
    for (const via of cond === null ? [] : split(cond, 'or')) {
      const u = use(via, best, owner);
      if (u) cands.push({ a: u.a, why: { kind, via, uses: u.uses } });
    }
  }
  return cands;
}

/**
 * The fixpoint gets the assumptions right, but on a tie it can keep paths
 * that hold each other up: mail by recovery through phone_number,
 * phone_number through carrier, carrier by recovery through mail. So place
 * the paths outward from the start, and when only such a loop is left, let
 * the first thing in it with another way in, through what's placed and
 * relying on the same assumptions, take that way instead.
 */
function ground(things: Map<string, Spec>, best: Best, seed: Best): Best {
  const out: Best = new Map(seed);
  const deps = (w: Why) => (w.kind === 'in' ? [w.via] : w.kind === 'start' || w.kind === 'state' ? [] : w.uses);
  const placed = (e: Entry) => deps(e.why).every((d) => d === UNKNOWN || out.has(d));
  for (;;) {
    const ready = [...best].filter(([tid, e]) => !out.has(tid) && placed(e));
    for (const [tid, e] of ready) out.set(tid, e);
    if (ready.length) continue;
    const freed = [...best].some(([tid, { a }]) => {
      const e = out.has(tid)
        ? undefined
        : bestOf(candidates(tid, things.get(tid)!, out).filter((c) => cmpStrings(c.a, a) === 0));
      if (e) out.set(tid, e);
      return e !== undefined;
    });
    if (!freed) break;
  }
  // If the greedy `or` choices ever leave something unplaced, it keeps the
  // fixpoint's path; display code guards against loops.
  for (const [tid, e] of best) if (!out.has(tid)) out.set(tid, e);
  return out;
}

/** Everything reachable from start: id -> (assumptions relied on, why). */
export function reach(
  things: Map<string, Spec>,
  start: Iterable<string>,
  lost: Set<string>,
  assume = new Set<string>(),
  deny = new Set<string>(),
): Best {
  const avail = availability(things, lost);
  const seed: Best = new Map();
  for (const s of start) if (avail.get(s)) seed.set(s, { a: [], why: START });
  // States hold for anyone, but only as an assumption unless pinned.
  for (const [tid, spec] of things) {
    if (spec.kind === 'state' && avail.get(tid) && !deny.has(tid) && !seed.has(tid)) {
      seed.set(tid, { a: assume.has(tid) ? [] : [tid], why: STATE });
    }
  }
  let best: Best = new Map(seed);
  // Recompute everything from the previous pass until nothing changes, so a
  // better path upstream reaches everything downstream of it.
  for (let pass = 0; pass < 2 * things.size + 2; pass++) {
    const nxt: Best = new Map(seed);
    for (const [tid, spec] of things) {
      if (!avail.get(tid) || seed.has(tid)) continue;
      const e = bestOf(candidates(tid, spec, best));
      if (e) nxt.set(tid, e);
    }
    const done = nxt.size === best.size && [...nxt].every(([k, e]) => best.has(k) && sameEntry(e, best.get(k)!));
    best = nxt; // on the last pass, its `or` choices come from the final assumptions
    if (done) break;
  }
  return ground(things, best, seed);
}

/** Lower is more reachable: 0 outright, n assumptions, Infinity not at all. */
export function rank(tid: string, best: Best): number {
  return best.get(tid)?.a.length ?? Infinity;
}

export type Row = [status: string, how: string];

export class Model {
  readonly things: Map<string, Spec>;
  readonly scenarios: Map<string, Scenario>;
  readonly me: string[];
  /** Ids of kind `state`, for labeling assumptions. */
  readonly states: Set<string>;
  readonly baseMe: Best;
  readonly baseNobody: Best;

  constructor(source: Source, plans: string[] = []) {
    const { things, scenarios, me } = load(source, plans);
    this.things = things;
    this.scenarios = scenarios;
    this.me = me;
    this.states = new Set([...things].filter(([, s]) => s.kind === 'state').map(([t]) => t));
    this.baseMe = this.run(BASELINE).best;
    this.baseNobody = reach(things, [], new Set());
  }

  scenario(name: string): Scenario {
    const sc = this.scenarios.get(name);
    if (!sc) throw new ReachError(`unknown scenario: ${name}`);
    return sc;
  }

  start(sc: Scenario): string[] {
    return sc.kind === 'lockout' ? this.me : (sc.attacker ?? []);
  }

  run(name: string): { sc: Scenario; best: Best } {
    const sc = this.scenario(name);
    const best = reach(this.things, this.start(sc), new Set(sc.lost), new Set(sc.assume), new Set(sc.deny));
    return { sc, best };
  }

  /** Reach with each state alone holding (all other free states denied), so a
   *  result can name every single state that would be enough. */
  solo(name: string): Map<string, Best> {
    const sc = this.scenario(name);
    const assume = new Set(sc.assume);
    const deny = new Set(sc.deny);
    const free = [...this.states].filter((t) => !assume.has(t) && !deny.has(t));
    const lost = new Set(sc.lost);
    return new Map(
      free.map((s) => [
        s,
        reach(
          this.things,
          this.start(sc),
          lost,
          new Set([...assume, s]),
          new Set([...deny, ...free.filter((f) => f !== s)]),
        ),
      ]),
    );
  }

  fmtUnknowns(a: Assumptions): string {
    return (
      'if ' +
      [...a]
        .sort()
        .map((x) => (this.states.has(x) ? `${x} (state)` : `${x} (${UNKNOWN})`))
        .join(', ')
    );
  }

  verdict(a: Assumptions, outright: string): string {
    if (!a.length) return outright;
    const word = a.every((x) => this.states.has(x)) ? 'DEPENDS' : 'UNSURE';
    return `${word}  ${this.fmtUnknowns(a)}`;
  }

  /** verdict(), but listing every single state that's enough on its own. */
  label(t: string, a: Assumptions, outright: string, solo: () => Map<string, Best>): string {
    if (a.length && a.every((x) => this.states.has(x))) {
      const enough = [...solo()].filter(([, best]) => best.get(t)?.a.length === 0).map(([s]) => s);
      if (enough.length > 1) return 'DEPENDS  if any one of ' + enough.sort().join(', ') + ' (state)';
    }
    return this.verdict(a, outright);
  }

  /** Problems in a scenario: id -> (status, how). */
  rows(name: string): Map<string, Row> {
    const { sc, best } = this.run(name);
    let cache: Map<string, Best> | undefined;
    const solo = () => (cache ??= this.solo(name));
    const lockout = sc.kind === 'lockout';
    const base = lockout ? (name === BASELINE ? null : this.baseMe) : this.baseNobody;
    const out = new Map<string, Row>();
    for (const [t, spec] of this.things) {
      if (!spec.check.includes(sc.kind)) continue;
      const r = rank(t, best);
      if (lockout) {
        if (r === 0 || (base !== null && r <= rank(t, base))) continue;
        out.set(t, [best.has(t) ? this.label(t, best.get(t)!.a, '', solo) : 'LOST', '']);
      } else {
        // An unsure path only counts if it's not the same guess an attacker
        // with nothing would be making.
        const b = base!.get(t);
        if (
          r === Infinity ||
          (r > 0 && (r > rank(t, base!) || (b !== undefined && cmpStrings(best.get(t)!.a, b.a) === 0)))
        ) {
          continue;
        }
        const { a, why } = best.get(t)!;
        out.set(t, [this.label(t, a, 'REACHED', solo), `via ${fmtWhy(why)}`]);
      }
    }
    return out;
  }
}

export function fmtWhy(why: Why): string {
  if (why.kind === 'start' || why.kind === 'state') return why.kind;
  if (why.kind === 'in') return `in ${why.via}`;
  return `${why.kind} ${fmtCond(why.via)}`;
}
