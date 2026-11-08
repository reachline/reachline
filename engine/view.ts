// Views of the model as plain nodes and edges, for the app to draw and the
// CLI to write as Mermaid. Junction ids come from their position in the model
// (not a counter), so a junction keeps its id as the view expands.
import { refs, split, UNKNOWN, type Cond, type Op } from './cond.ts';
import { availability, REFS, type Best, type Kind, type Model, type Row, type Scenario, type Spec } from './model.ts';

/** One scenario's results, as the views colour them. */
export interface Outcome {
  sc: Scenario;
  start: string[];
  best: Best;
  avail: Map<string, boolean>;
  rows: Map<string, Row>;
}

export function outcome(m: Model, name: string): Outcome {
  const { sc, best } = m.run(name);
  return { sc, start: m.start(sc), best, avail: availability(m.things, new Set(sc.lost)), rows: m.rows(name) };
}

export type NodeKind = Kind | 'and' | 'or' | 'unknown';
export type EdgeKind = 'in' | 'needs' | 'mirror' | 'access' | 'recovery' | 'part';
export type Status = 'has' | 'maybe' | 'lost' | 'gone' | 'start' | 'none';

export interface VNode {
  id: string;
  label: string;
  kind: NodeKind;
  status?: Status;
  row?: string; // the CLI's verdict for this thing in the scenario, if flagged
  more?: boolean; // has ways in that aren't shown yet
  expanded?: boolean; // its ways in are shown, and can be hidden
  moreOut?: boolean; // is a way into things that aren't shown yet
  expandedOut?: boolean; // what it's a way into is shown, and can be hidden
  root?: boolean;
  flag?: boolean; // checked for the scenario's kind
}

export interface VEdge {
  id: string;
  source: string;
  target: string;
  kind: EdgeKind;
  live: boolean; // can carry access in the scenario
  by?: string; // a mirror's: what syncs it
}

export interface View {
  nodes: VNode[];
  edges: VEdge[];
}

export const isJunction = (k: NodeKind) => k === 'and' || k === 'or' || k === 'unknown';

const FIELDS = REFS.things;
type Field = (typeof FIELDS)[number];

/** The things a field of t names. */
function named(t: Spec, f: Field): string[] {
  if (f === 'in') return t.in.filter((c) => c !== UNKNOWN);
  if (f === 'mirrors') return t.mirrors ? [t.mirrors.of] : [];
  return [...refs(t[f])];
}

/** Every thing with a direct way into tid. */
function incoming(m: Model, tid: string): string[] {
  const t = m.things.get(tid)!;
  return [...new Set(FIELDS.flatMap((f) => named(t, f)))];
}

/** For each thing, the fields of other things that name it: what it's a way into. */
function outgoing(m: Model): Map<string, [string, Field][]> {
  const out = new Map<string, [string, Field][]>();
  for (const [tid, t] of m.things)
    for (const f of FIELDS) for (const id of new Set(named(t, f))) out.set(id, [...(out.get(id) ?? []), [tid, f]]);
  return out;
}

class Builder {
  nodes = new Map<string, VNode>();
  edges = new Map<string, VEdge>();
  /** Thing nodes, in the order they were added. */
  things: string[] = [];
  /** The fields drawn, as `thing:field`. */
  drawn = new Set<string>();

  private readonly m: Model;
  private readonly sc?: Outcome;

  constructor(m: Model, sc?: Outcome) {
    this.m = m;
    this.sc = sc;
  }

  ok = (id: string) => !this.sc || this.sc.best.has(id);
  avail = (id: string) => this.sc?.avail.get(id) ?? true;

  node(id: string): string {
    if (!this.nodes.has(id)) {
      this.nodes.set(id, { id, label: id, kind: this.m.things.get(id)!.kind });
      this.things.push(id);
    }
    return id;
  }

  junction(id: string, kind: 'and' | 'or' | 'unknown'): string {
    if (!this.nodes.has(id)) this.nodes.set(id, { id, label: kind === 'unknown' ? UNKNOWN : kind.toUpperCase(), kind });
    return id;
  }

  edge(source: string, target: string, kind: EdgeKind, live = true): VEdge {
    const id = `${source}>${target}:${kind}`;
    const e = this.edges.get(id);
    if (e) e.live &&= live;
    else this.edges.set(id, { id, source, target, kind, live });
    return this.edges.get(id)!;
  }

  /** The edge from what tid mirrors, if it mirrors anything. */
  mirror(tid: string) {
    const m = this.m.things.get(tid)!.mirrors;
    if (m) this.edge(this.node(m.of), this.node(tid), 'mirror').by = m.by;
  }

  /** The node standing for a condition at path, and whether it holds by `ok` (an unknown might, so it counts). */
  cond(c: Cond, path: string, ok: (id: string) => boolean): [string, boolean] {
    if (c === UNKNOWN) return [this.junction(`${path}?`, 'unknown'), true];
    if (typeof c === 'string') return [this.node(c), ok(c)];
    const j = this.junction(path, c.op);
    const oks = c.of.map((x, i) => {
      const [nid, live] = this.cond(x, `${path}.${i}`, ok);
      this.edge(nid, j, 'part', live);
      return live;
    });
    return [j, c.op === 'or' ? oks.some(Boolean) : oks.every(Boolean)];
  }

  /** Edges into target, one for each part of c joined by op at its top: the
   *  options of access and recovery, the places of in, the requirements of needs. */
  into(c: Cond | null, op: Op, target: string, kind: EdgeKind, ok: (id: string) => boolean = this.ok) {
    (c === null ? [] : split(c, op)).forEach((part, i) => {
      const [nid, live] = this.cond(part, `${target}/${kind}${i}`, ok);
      this.edge(nid, this.node(target), kind, live);
    });
  }

  /** The edges into tid from one of its fields, once. */
  field(tid: string, f: Field) {
    if (this.drawn.has(`${tid}:${f}`)) return;
    this.drawn.add(`${tid}:${f}`);
    const t = this.m.things.get(tid)!;
    if (f === 'in') this.into(places(t.in), 'or', tid, 'in');
    else if (f === 'needs') this.into(t.needs, 'and', tid, 'needs', this.avail);
    else if (f === 'mirrors') this.mirror(tid);
    else this.into(t[f], 'or', tid, f);
  }

  color() {
    const sc = this.sc;
    if (!sc) return;
    const lockout = sc.sc.kind === 'lockout';
    const start = new Set(sc.start);
    for (const n of this.nodes.values()) {
      if (isJunction(n.kind)) continue;
      const t = this.m.things.get(n.id)!;
      const r = sc.best.get(n.id);
      n.flag = t.check.includes(sc.sc.kind);
      n.row = sc.rows.get(n.id)?.[0];
      if (!this.avail(n.id)) n.status = 'gone';
      else if (!lockout && start.has(n.id)) n.status = 'start';
      else if (r) n.status = r.a.length ? 'maybe' : 'has';
      // The fill says what happened, checked or not, in either kind; `row` (the "!") says what the scenario reports.
      else if (lockout) n.status = 'lost';
      else n.status = 'none';
    }
  }

  view(): View {
    this.color();
    return { nodes: [...this.nodes.values()], edges: [...this.edges.values()] };
  }
}

/** A thing's places as one condition: any one of them. */
const places = (ins: string[]): Cond | null => (ins.length ? { op: 'or', of: ins } : null);

/** Containment (in), dependencies (needs) and mirrors, for everything that has them. */
export function whereView(m: Model, sc?: Outcome): View {
  const b = new Builder(m, sc);
  for (const [tid, t] of m.things) {
    b.into(places(t.in), 'or', tid, 'in');
    b.into(t.needs, 'and', tid, 'needs', b.avail);
    b.mirror(tid);
  }
  return b.view();
}

/**
 * Every way into the roots, following only expanded nodes ('all' expands
 * everything), and what each node in `forward` is a way into. Nodes are
 * marked with what more they could show, or hide, in each direction.
 */
export function waysInView(
  m: Model,
  roots: string[],
  expanded: Set<string> | 'all',
  sc?: Outcome,
  forward: ReadonlySet<string> = new Set(),
): View {
  const b = new Builder(m, sc);
  const all = expanded === 'all';
  const out = all ? null : outgoing(m);
  const seen = new Set<string>();
  const queue = [...roots];
  while (queue.length) {
    const tid = queue.shift()!;
    if (seen.has(tid)) continue;
    seen.add(tid);
    b.node(tid);
    // Drawing a field adds the things it names, which are then visited in turn.
    const before = b.things.length;
    if (all || expanded.has(tid)) for (const f of FIELDS) b.field(tid, f);
    if (forward.has(tid)) for (const [uid, f] of out?.get(tid) ?? []) b.field(uid, f);
    queue.push(...b.things.slice(before));
  }
  for (const tid of b.things) {
    const n = b.nodes.get(tid)!;
    const t = m.things.get(tid)!;
    const ins = FIELDS.filter((f) => named(t, f).length);
    const outs = out?.get(tid) ?? [];
    n.more = ins.some((f) => !b.drawn.has(`${tid}:${f}`));
    n.expanded = !all && expanded.has(tid) && ins.length > 0;
    n.moreOut = outs.some(([uid, f]) => !b.drawn.has(`${uid}:${f}`));
    n.expandedOut = forward.has(tid) && outs.length > 0;
  }
  for (const r of roots) b.nodes.get(r)!.root = true;
  return b.view();
}

/**
 * The path a scenario takes to each thing it checks (for a breach, those it
 * reports): one way into each, through an AND where it takes several things.
 */
export function pathView(m: Model, sc: Outcome): View {
  const b = new Builder(m, sc);
  const done = new Set<string>();
  const walk = (tid: string): void => {
    if (done.has(tid)) return;
    done.add(tid);
    b.node(tid);
    const { why } = sc.best.get(tid)!;
    if (why.kind === 'start' || why.kind === 'state') return;
    const kind: EdgeKind = why.kind;
    const picks = (why.kind === 'in' ? [why.via] : why.uses).map((x, i) => {
      if (x === UNKNOWN) return b.junction(`${tid}/${kind}?${i}`, 'unknown');
      walk(x);
      return x;
    });
    if (picks.length === 1) b.edge(picks[0], tid, kind);
    else {
      const j = b.junction(`${tid}/${kind}`, 'and');
      for (const p of picks) b.edge(p, j, 'part');
      b.edge(j, tid, kind);
    }
  };
  const kind = sc.sc.kind;
  const targets = [...m.things]
    .filter(([t, s]) => s.check.includes(kind) && (kind === 'lockout' || sc.rows.has(t)))
    .map(([t]) => t);
  for (const t of targets) {
    if (sc.best.has(t)) walk(t);
    else b.node(t);
  }
  return b.view();
}

/** The ids within `depth` steps of the roots whose ways in should show. */
export function expandToDepth(m: Model, roots: string[], depth: number): Set<string> {
  const out = new Set<string>();
  let layer = roots;
  for (let d = 0; d < depth && layer.length; d++) {
    const next: string[] = [];
    for (const tid of layer) {
      if (out.has(tid)) continue;
      out.add(tid);
      next.push(...incoming(m, tid));
    }
    layer = next;
  }
  return out;
}
