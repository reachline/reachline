// Views of the model as plain nodes and edges, ported from engine/mermaid.ts's
// builders. Junction ids come from their position in the model (not a
// counter), so a junction keeps its id as the view expands.
import { leaves, refs, type AndSet, type Expr, type Kind, type Model } from '../../engine/model.ts';
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
  flag?: boolean; // critical (lockout) or sensitive (breach)
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

/** Every thing with a direct way into tid. */
export function incoming(m: Model, tid: string): string[] {
  const t = m.things.get(tid)!;
  const mir = t.mirrors ? [t.mirrors.of] : [];
  return [...new Set([...t.in, ...t.needs, ...mir, ...refs(t.access), ...refs(t.recovery)])];
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
    if (!this.nodes.has(id)) this.nodes.set(id, { id, label: kind === 'unknown' ? '?' : kind.toUpperCase(), kind });
    return id;
  }

  edge(source: string, target: string, kind: EdgeKind, live = true) {
    const id = `${source}>${target}:${kind}`;
    const e = this.edges.get(id);
    if (e) e.live &&= live;
    else this.edges.set(id, { id, source, target, kind, live });
  }

  /** A junction over items; it holds if any (or) or every (and) item does. */
  join(
    path: string,
    kind: 'and' | 'or',
    items: Expr[],
    part: (x: Expr, path: string) => [string, boolean],
  ): [string, boolean] {
    const j = this.junction(path, kind);
    const oks = items.map((x, i) => {
      const [nid, ok] = part(x, `${path}.${i}`);
      this.edge(nid, j, 'part', ok);
      return ok;
    });
    return [j, kind === 'or' ? oks.some(Boolean) : oks.every(Boolean)];
  }

  /** The node standing for one element of an access set, and whether it holds. */
  element(e: Expr, path: string): [string, boolean] {
    if (e === '?') return [this.junction(`${path}?`, 'unknown'), true];
    if (typeof e === 'string') return [this.node(e), this.ok(e)];
    return this.join(path, 'or', e, (x, p) => this.option(x, p));
  }

  /** One option of an any-of: a list needs every one of its leaves. */
  option(x: Expr, path: string): [string, boolean] {
    return Array.isArray(x) ? this.join(path, 'and', leaves(x), (l, p) => this.element(l, p)) : this.element(x, path);
  }

  accessSet(s: AndSet, target: string, kind: 'access' | 'recovery', i: number) {
    const path = `${target}/${kind}${i}`;
    // A lone any-of set is just more alternatives into the target.
    if (s.length === 1 && Array.isArray(s[0])) {
      s[0].forEach((x, k) => {
        const [nid, ok] = this.option(x, `${path}.0.${k}`);
        this.edge(nid, target, kind, ok);
      });
    } else if (s.length === 1) {
      const [nid, ok] = this.element(s[0], `${path}.0`);
      this.edge(nid, target, kind, ok);
    } else {
      const [j, ok] = this.join(path, 'and', s, (e, p) => this.element(e, p));
      this.edge(j, target, kind, ok);
    }
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
      n.flag = t.tags.includes(lockout ? 'critical' : 'sensitive');
      n.row = sc.rows.get(n.id)?.[0];
      if (!this.avail(n.id)) n.status = 'gone';
      else if (!lockout && start.has(n.id)) n.status = 'start';
      else if (r) n.status = r.a.length ? 'maybe' : 'has';
      else if (lockout && t.tags.includes('critical')) n.status = 'lost';
      else n.status = 'none';
    }
  }

  view(): View {
    this.color();
    return { nodes: [...this.nodes.values()], edges: [...this.edges.values()] };
  }
}

/** Containment (in), dependencies (needs) and mirrors, for everything that has them. */
export function whereView(m: Model, sc?: Outcome): View {
  const b = new Builder(m, sc);
  for (const [tid, t] of m.things) {
    for (const c of t.in) b.edge(b.node(c), b.node(tid), 'in');
    for (const n of t.needs) b.edge(b.node(n), b.node(tid), 'needs');
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
    for (const c of t.in) b.edge(b.node(c), tid, 'in', b.ok(c));
    for (const n of t.needs) b.edge(b.node(n), tid, 'needs', b.avail(n));
    if (t.mirrors) b.edge(b.node(t.mirrors.of), tid, 'mirror');
    t.access.forEach((s, i) => b.accessSet(s, tid, 'access', i));
    t.recovery.forEach((s, i) => b.accessSet(s, tid, 'recovery', i));
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
