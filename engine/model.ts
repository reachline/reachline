// The model and the reach engine, ported from the original reach.py. Nothing here
// touches the filesystem, so it runs in the browser as well as the CLI.
import { parse } from 'yaml';

export const SECTIONS = ['locations', 'devices', 'states', 'secrets', 'services', 'data', 'accounts'] as const;
export type Section = (typeof SECTIONS)[number];

/** The format version a file may declare with a top-level `version:` (optional). */
export const VERSION = 1;

/** An element of an access set: an id, "?" (unknown), or a list meaning any-of. */
export type Expr = string | Expr[];
export type AndSet = Expr[];

export interface Spec {
  section: Section;
  in: string[];
  needs: string[];
  access: AndSet[];
  recovery: AndSet[];
  mirrors: { of: string; by: string } | null;
  note?: unknown;
  todo?: unknown;
  critical?: unknown;
  sensitive?: unknown;
  [field: string]: unknown;
}

export interface Scenario {
  kind: string; // 'lockout' | 'breach'
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
  // uses: what the path takes from the set, one option per any-of ("?" for an unknown).
  | { kind: 'access' | 'recovery'; via: AndSet; uses: string[] };

export interface Entry {
  a: Assumptions;
  why: Why;
}

/** Everything reached: id -> the path with the fewest assumptions. */
export type Best = Map<string, Entry>;

/** A problem in the model or the command line; the CLI prints it and exits 1. */
export class ReachError extends Error {}

export interface Source {
  path: string;
  text: string;
}

type Raw = Record<string, unknown>;
const isMap = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v);
const entries = (v: unknown): [string, unknown][] => (isMap(v) ? Object.entries(v) : []);

/** Load model.yml and any plans, in order. Plans replace whole fields. */
export function load(sources: Source[]): { things: Map<string, Spec>; scenarios: Map<string, Scenario>; me: string[] } {
  const raw = new Map<string, Raw>();
  const scenarios = new Map<string, Scenario>();
  let me: unknown = null;
  sources.forEach(({ path, text }, i) => {
    let doc: unknown;
    try {
      doc = parse(text, { uniqueKeys: false }) ?? {}; // like PyYAML: a repeated key overrides
    } catch (e) {
      throw new ReachError(`${path}: ${(e as Error).message}`);
    }
    if (!isMap(doc)) throw new ReachError(`${path}: expected a mapping at the top level`);
    if ('version' in doc && doc.version !== VERSION) {
      throw new ReachError(`${path}: format version ${String(doc.version)} (this engine reads version ${VERSION})`);
    }
    const seen = new Set<string>();
    for (const section of SECTIONS) {
      for (const [tid, spec] of entries(doc[section])) {
        if (seen.has(tid)) throw new ReachError(`${path}: duplicate id: ${tid}`);
        seen.add(tid);
        if (spec !== null && !isMap(spec)) throw new ReachError(`${path}: ${tid}: expected a mapping`);
        if (i && spec === null) raw.delete(tid);
        else if (i && raw.has(tid)) raw.set(tid, { ...raw.get(tid), ...spec });
        else raw.set(tid, { ...(spec ?? {}), section });
      }
    }
    for (const [name, sc] of entries(doc.scenarios)) {
      if (sc === null) scenarios.delete(name);
      else if (isMap(sc)) scenarios.set(name, { ...scenarios.get(name), ...sc } as Scenario);
      else throw new ReachError(`${path}: scenario ${name}: expected a mapping`);
    }
    if ('me' in doc) me = doc.me;
  });
  const things = new Map([...raw].map(([tid, spec]) => [tid, normalize(tid, spec)]));
  const meList = Array.isArray(me) ? me.map(String) : [];
  validate(things, scenarios, meList);
  return { things, scenarios, me: meList };
}

function normalize(tid: string, raw: Raw): Spec {
  const spec: Raw = { ...raw };
  // in: "?" means an unknown home: reachable only by assuming it.
  if (spec.in === '?') {
    spec.in = [];
    spec.access = [['?'], ...((spec.access as AndSet[] | undefined) ?? [])];
  }
  for (const key of ['in', 'needs', 'access', 'recovery']) {
    spec[key] ??= [];
    if (spec[key] === '?' && (key === 'access' || key === 'recovery')) spec[key] = [['?']];
    if (!Array.isArray(spec[key])) throw new ReachError(`${tid}: ${key} must be a list`);
  }
  for (const key of ['access', 'recovery']) {
    if ((spec[key] as unknown[]).some((s) => !Array.isArray(s))) {
      throw new ReachError(`${tid}: each ${key} entry must be a list (an AND-set)`);
    }
  }
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- any falsy value means none
  spec.mirrors = spec.mirrors || null;
  return spec as Spec;
}

export function* refs(expr: Expr | AndSet[]): Generator<string> {
  if (Array.isArray(expr)) for (const e of expr) yield* refs(e);
  else if (expr !== '?') yield expr;
}

/** Every id and "?" in an expression. A list inside an any-of needs all of these. */
export const leaves = (e: Expr): string[] => (Array.isArray(e) ? e.flatMap(leaves) : [e]);

function validate(things: Map<string, Spec>, scenarios: Map<string, Scenario>, me: string[]) {
  const bad: [string, string][] = [];
  for (const [tid, spec] of things) {
    for (const key of ['in', 'needs', 'access', 'recovery'] as const) {
      for (const r of refs(spec[key])) if (!things.has(r)) bad.push([tid, r]);
    }
    if (spec.mirrors) {
      for (const r of [spec.mirrors.of, spec.mirrors.by]) if (!things.has(r)) bad.push([tid, r]);
    }
  }
  for (const [name, sc] of scenarios) {
    for (const r of [...(sc.lost ?? []), ...(sc.attacker ?? [])]) if (!things.has(r)) bad.push([name, r]);
    for (const r of [...(sc.assume ?? []), ...(sc.deny ?? [])]) {
      if (things.get(r)?.section !== 'states') bad.push([name, `${r} (not a state)`]);
    }
  }
  for (const r of me) if (!things.has(r)) bad.push(['me', r]);
  if (bad.length) throw new ReachError('unknown references:\n' + bad.map(([a, b]) => `  ${a}: ${b}`).join('\n'));
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
    let ok =
      !lost.has(tid) &&
      spec.needs.every((n) => avail(n, st)) &&
      (spec.in.length === 0 || spec.in.some((c) => avail(c, st)));
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

/** What one element of an access set relies on and uses, or null if it can't
 *  be reached. An any-of takes the option with the fewest assumptions, the
 *  first listed on a tie. */
function element(e: Expr, best: Best, owner: string): Use | null {
  const all = (ids: string[]): Use | null => {
    const as: Assumptions[] = [];
    for (const id of ids) {
      const a = id === '?' ? [owner] : best.get(id)?.a;
      if (!a) return null;
      as.push(a);
    }
    return { a: union(...as), uses: ids };
  };
  if (!Array.isArray(e)) return all([e]);
  let min: Use | null = null;
  for (const option of e) {
    const u = all(leaves(option));
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
    const e = best.get(c);
    if (e) cands.push({ a: e.a, why: { kind: 'in', via: c } });
  }
  for (const kind of ['access', 'recovery'] as const) {
    const owner = kind === 'access' ? tid : `${tid}.recovery`;
    for (const s of spec[kind]) {
      const parts = s.map((e) => element(e, best, owner));
      if (!parts.every((p) => p !== null)) continue;
      const uses = [...new Set(parts.flatMap((p) => p.uses))];
      cands.push({ a: union(...parts.map((p) => p.a)), why: { kind, via: s, uses } });
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
  const placed = (e: Entry) => deps(e.why).every((d) => d === '?' || out.has(d));
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
  // If the greedy any-of choices ever leave something unplaced, it keeps the
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
    if (spec.section === 'states' && avail.get(tid) && !deny.has(tid) && !seed.has(tid)) {
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
    best = nxt; // on the last pass, its any-of choices come from the final assumptions
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
  /** Ids under `states:`, for labeling assumptions. */
  readonly states: Set<string>;
  readonly baseMe: Best;
  readonly baseNobody: Best;

  constructor(sources: Source[]) {
    const { things, scenarios, me } = load(sources);
    this.things = things;
    this.scenarios = scenarios;
    this.me = me;
    this.states = new Set([...things].filter(([, s]) => s.section === 'states').map(([t]) => t));
    if (!scenarios.has('baseline')) throw new ReachError('no baseline scenario');
    this.baseMe = this.run('baseline').best;
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
        .map((x) => (this.states.has(x) ? `${x} (state)` : `${x} (?)`))
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
    const base = lockout ? (name === 'baseline' ? null : this.baseMe) : this.baseNobody;
    const out = new Map<string, Row>();
    for (const [t, spec] of this.things) {
      if (!(lockout ? spec.critical : spec.sensitive)) continue;
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

export function fmtSet(s: AndSet): string {
  const option = (o: Expr) => (Array.isArray(o) ? '(' + leaves(o).join(' + ') + ')' : o);
  return s.map((e) => (Array.isArray(e) ? '(' + e.map(option).join(' | ') + ')' : e)).join(' + ');
}

export function fmtWhy(why: Why): string {
  if (why.kind === 'start' || why.kind === 'state') return why.kind;
  if (why.kind === 'in') return `in ${why.via}`;
  return `${why.kind} ${fmtSet(why.via)}`;
}
