// Views of the model as plain nodes and edges, ported from engine/mermaid.ts's
// builders. Junction ids come from their position in the model (not a
// counter), so a junction keeps its id as the view expands.
import { refs, split, UNKNOWN, type Cond, type Op } from '../../engine/cond.ts';
import type { Kind, Model } from '../../engine/model.ts';
import type { Outcome } from './data.ts';

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
  expanded?: boolean;
  root?: boolean;
  flag?: boolean; // checked for the scenario's kind
}

export interface VEdge {
  id: string;
  source: string;
  target: string;
  kind: EdgeKind;
  live: boolean; // can carry access in the scenario
}

export interface View {
  nodes: VNode[];
  edges: VEdge[];
}

export const isJunction = (k: NodeKind) => k === 'and' || k === 'or' || k === 'unknown';

/**
 * A node's status in words, and the glyph that shows it beside the name so
 * it isn't told by colour alone. The glyph follows the colour: ✓ where the
 * fill is good, ✗ where it's bad, ? where it rests on assumptions.
 */
export function verdict(n: VNode, scenarioKind: string): { mark?: string; words: string } | undefined {
  const breach = scenarioKind === 'breach';
  switch (n.status) {
    case 'has':
      return breach ? { mark: '✗', words: 'reached by the attacker' } : { mark: '✓', words: 'reached' };
    case 'maybe':
      return {
        mark: '?',
        words: breach ? 'reached by the attacker if assumptions hold' : 'reached if assumptions hold',
      };
    case 'lost':
      return { mark: '✗', words: 'lost' };
    case 'gone':
      return { words: 'gone in this scenario' };
    case 'start':
      return { words: 'where the attacker starts' };
    case 'none':
      return { words: 'not reached' };
    default:
      return undefined;
  }
}

const JUNCTIONS = { and: 'all of these (and)', or: 'any one of these (or)', unknown: 'something not known (unknown)' };

/** A node's name for screen readers: what it is, and what the scenario says about it. */
export function describe(n: VNode, scenarioKind: string): string {
  if (n.kind === 'and' || n.kind === 'or' || n.kind === 'unknown') return JUNCTIONS[n.kind];
  const parts = [n.label, n.kind];
  if (n.flag) parts.push(`checked for ${scenarioKind}s`);
  const v = verdict(n, scenarioKind);
  if (v) parts.push(v.words);
  if (n.row) parts.push(`flagged: ${n.row.toLowerCase()}`);
  if (n.more) parts.push('has more ways in');
  return parts.join(', ');
}

/** Every thing with a direct way into tid. */
export function incoming(m: Model, tid: string): string[] {
  const t = m.things.get(tid)!;
  const mir = t.mirrors ? [t.mirrors.of] : [];
  const places = t.in.filter((c) => c !== UNKNOWN);
  return [...new Set([...places, ...refs(t.needs), ...mir, ...refs(t.access), ...refs(t.recovery)])];
}

class Builder {
  nodes = new Map<string, VNode>();
  edges = new Map<string, VEdge>();

  private readonly m: Model;
  private readonly sc?: Outcome;

  constructor(m: Model, sc?: Outcome) {
    this.m = m;
    this.sc = sc;
  }

  ok = (id: string) => !this.sc || this.sc.best.has(id);
  avail = (id: string) => this.sc?.avail.get(id) ?? true;

  node(id: string): string {
    if (!this.nodes.has(id)) this.nodes.set(id, { id, label: id, kind: this.m.things.get(id)!.kind });
    return id;
  }

  junction(id: string, kind: 'and' | 'or' | 'unknown'): string {
    if (!this.nodes.has(id)) this.nodes.set(id, { id, label: kind === 'unknown' ? UNKNOWN : kind.toUpperCase(), kind });
    return id;
  }

  edge(source: string, target: string, kind: EdgeKind, live = true) {
    const id = `${source}>${target}:${kind}`;
    const e = this.edges.get(id);
    if (e) e.live &&= live;
    else this.edges.set(id, { id, source, target, kind, live });
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
      else if (lockout && t.check.includes('lockout')) n.status = 'lost';
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
    if (t.mirrors) b.edge(b.node(t.mirrors.of), b.node(tid), 'mirror');
  }
  return b.view();
}

/**
 * Every way into the roots, following only expanded nodes ('all' expands
 * everything). Unexpanded nodes with ways in are marked `more`.
 */
export function waysInView(m: Model, roots: string[], expanded: Set<string> | 'all', sc?: Outcome): View {
  const b = new Builder(m, sc);
  const seen = new Set<string>();
  const frontier = [...roots];
  while (frontier.length) {
    const tid = frontier.shift()!;
    if (seen.has(tid)) continue;
    seen.add(tid);
    b.node(tid);
    const ins = incoming(m, tid);
    const node = b.nodes.get(tid)!;
    if (expanded !== 'all' && !expanded.has(tid)) {
      node.more = ins.length > 0;
      continue;
    }
    node.expanded = ins.length > 0;
    const t = m.things.get(tid)!;
    b.into(places(t.in), 'or', tid, 'in');
    b.into(t.needs, 'and', tid, 'needs', b.avail);
    if (t.mirrors) b.edge(b.node(t.mirrors.of), tid, 'mirror');
    b.into(t.access, 'or', tid, 'access');
    b.into(t.recovery, 'or', tid, 'recovery');
    frontier.push(...ins);
  }
  for (const r of roots) b.nodes.get(r)!.root = true;
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
