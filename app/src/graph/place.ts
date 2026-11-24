// Where a view's nodes and edges go: ELK's layered layout of the whole view,
// and, after that, changes that keep it: placing new nodes without moving
// anything, and making room for a node that changed width. Free of how ELK is
// loaded (layout.ts), so the tests can run it.
import type { ELK, ElkNode } from 'elkjs/lib/elk-api.js';
import { edgeId, isJunction, type View, type VNode } from '../../../engine/view.ts';
import { verdict } from './nodes.ts';
import { END, FONT, ICON, statusWidth, type Box, type Placed, type Pt, type Routing } from './shapes.ts';

export type { Box, Placed, Pt, Routing };

const THING_H = 28;
const JUNCTION = 24;
/** An unknown is shaped like a thing, wide enough to say so. */
const UNKNOWN_W = 54;

export type Direction = 'RIGHT' | 'DOWN';
// Network simplex gives straighter edges; Brandes-Köpf is about 7x faster here.
export type Placement = 'NETWORK_SIMPLEX' | 'BRANDES_KOEPF';

export interface LayoutOpts {
  direction: Direction;
  routing: Routing;
  placement: Placement;
}

let ctx: CanvasRenderingContext2D | null = null;

export function sizeOf(n: VNode): { w: number; h: number } {
  if (n.kind === 'unknown') return { w: UNKNOWN_W, h: THING_H };
  if (isJunction(n.kind)) return { w: JUNCTION, h: JUNCTION };
  // The ends, the icon, and what a scenario marks after the name. Whether there's a glyph doesn't depend on the scenario's kind.
  const extra = 2 * END + ICON + statusWidth(!!verdict(n, '')?.mark, !!n.row);
  // Outside a browser (bench.ts, the tests), estimate the text width.
  if (typeof document === 'undefined') return { w: n.label.length * 7 + extra, h: THING_H };
  ctx ??= document.createElement('canvas').getContext('2d')!;
  ctx.font = FONT;
  return { w: Math.ceil(ctx.measureText(n.label).width) + extra, h: THING_H };
}

/** The whole view laid out afresh by ELK. */
export async function elkLayout(elk: ELK, view: View, opts: LayoutOpts): Promise<Placed> {
  const t0 = performance.now();
  const graph: ElkNode = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': opts.direction,
      'elk.edgeRouting': opts.routing,
      'elk.spacing.nodeNode': '12',
      'elk.layered.spacing.nodeNodeBetweenLayers': '36',
      'elk.layered.spacing.edgeNodeBetweenLayers': '12',
      'elk.spacing.edgeEdge': '6',
      'elk.layered.nodePlacement.strategy': opts.placement,
      'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
    },
    children: view.nodes.map((n) => {
      const { w, h } = sizeOf(n);
      return { id: n.id, width: w, height: h };
    }),
    edges: view.edges.map((e) => ({ id: e.id, sources: [e.source], targets: [e.target] })),
  };
  const out = await elk.layout(graph);
  const nodes = new Map<string, Box>();
  for (const c of out.children ?? []) nodes.set(c.id, { x: c.x ?? 0, y: c.y ?? 0, w: c.width ?? 0, h: c.height ?? 0 });
  const edges = new Map<string, Pt[]>();
  for (const e of out.edges ?? []) {
    const pts: Pt[] = [];
    for (const s of e.sections ?? []) pts.push(s.startPoint, ...(s.bendPoints ?? []), s.endPoint);
    edges.set(e.id, pts);
  }
  return { nodes, edges, routing: opts.routing, ms: Math.round(performance.now() - t0) };
}

const same = (a: number, b: number) => Math.abs(a - b) < 0.5; // ELK's coordinates differ in the last digits

/**
 * prev resized for the view, keeping its shape. Only widths change (a name,
 * a scenario's status), so every node keeps its y, and moves right by the
 * most any node wholly left of it moved and grew; no gap closes, so nothing
 * comes to overlap. It stretches from the layout before any resize, so
 * undoing a change of size undoes the stretch. Edges keep their routes:
 * their ends move with their nodes, the bends between with the rest.
 * Re-running ELK instead re-packs the graph's separate parts, which moves them.
 */
export function resize(view: View, prev: Placed): Placed {
  const from = prev.base ?? prev;
  const placed = view.nodes
    .filter((n) => from.nodes.has(n.id))
    .map((n) => ({ id: n.id, b: from.nodes.get(n.id)!, w: sizeOf(n).w }))
    .sort((p, q) => p.b.x - q.b.x);
  // How far each node moves, and how far what's right of it must.
  const shift = new Map<string, number>();
  const after: { right: number; by: number }[] = [];
  const shiftAt = (x: number) => {
    const left = after.filter((a) => a.right <= x);
    return left.length ? Math.max(...left.map((a) => a.by)) : 0;
  };
  for (const p of placed) {
    const s = shiftAt(p.b.x); // all that's wholly left of p came before it
    shift.set(p.id, s);
    after.push({ right: p.b.x + p.b.w, by: s + p.w - p.b.w });
  }
  const nodes = new Map<string, Box>();
  for (const p of placed) nodes.set(p.id, { ...p.b, x: p.b.x + shift.get(p.id)!, w: p.w });

  const edges = new Map<string, Pt[]>();
  for (const e of view.edges) {
    const pts = from.edges.get(e.id);
    const [s, t] = [from.nodes.get(e.source), from.nodes.get(e.target)];
    if (!pts || pts.length < 2 || !s || !t || !nodes.has(e.source) || !nodes.has(e.target)) continue;
    // A point on a node moves with it: by its shift, and by its growth on its right side.
    const on = (b: Box, id: string) => (x: number) =>
      x + shift.get(id)! + (x >= b.x + b.w - 0.5 ? nodes.get(id)!.w - b.w : 0);
    // So does the straight run out of a port (as edges leave a node's bottom when the graph runs down).
    const [first, last] = [pts[0].x, pts[pts.length - 1].x];
    let i = 0;
    let j = pts.length - 1;
    while (i + 1 < j && same(pts[i + 1].x, first)) i++;
    while (j - 1 > i && same(pts[j - 1].x, last)) j--;
    const moved = pts.map((p, k) => ({
      x: k <= i ? on(s, e.source)(p.x) : k >= j ? on(t, e.target)(p.x) : p.x + shiftAt(p.x),
      y: p.y,
    }));
    // A vertical stretch whose ends moved apart gets a jog halfway, so an orthogonal route stays one.
    const route = [moved[0]];
    for (let k = 1; k < moved.length; k++) {
      const [a, b] = [moved[k - 1], moved[k]];
      if (from.routing === 'ORTHOGONAL' && same(pts[k - 1].x, pts[k].x) && !same(a.x, b.x)) {
        const y = (a.y + b.y) / 2;
        route.push({ x: a.x, y }, { x: b.x, y });
      }
      route.push(b);
    }
    edges.set(e.id, route);
  }
  return { nodes, edges, routing: from.routing, ms: 0, base: from };
}

/** prev with a renamed thing, the junctions into it (whose ids start with its own) and their edges under the new name. */
export function renamed(prev: Placed, was: View, from: string, to: string): Placed {
  const id = (x: string) => (x === from || x.startsWith(`${from}/`) ? to + x.slice(from.length) : x);
  const edges = new Map<string, Pt[]>();
  for (const e of was.edges) {
    const pts = prev.edges.get(e.id);
    if (pts) edges.set(edgeId(id(e.source), id(e.target), e.kind), pts);
  }
  // What it was stretched from goes: the renamed node is resized from here.
  return { nodes: new Map([...prev.nodes].map(([k, b]) => [id(k), b])), edges, routing: prev.routing, ms: 0 };
}

const GAP = 36; // between a new node and what it feeds into
const PAD = 8; // clearance kept around every node

const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.w + PAD && b.x < a.x + a.w + PAD && a.y < b.y + b.h + PAD && b.y < a.y + a.h + PAD;

/**
 * Add the view's new nodes without moving anything already placed: each goes
 * just upstream of what it feeds into (or downstream of what feeds it), in the
 * nearest free slot. Edges that already had an ELK route keep it; new ones get
 * a simple stepped route.
 */
export function placeLocally(view: View, prev: Placed, dir: Direction): Placed {
  // With nothing to add, prev stands as it is, still stretched from what resize kept.
  if (prev.nodes.size === view.nodes.length && view.edges.every((e) => prev.edges.has(e.id))) return prev;
  const nodes = new Map<string, Box>();
  for (const n of view.nodes) {
    const b = prev.nodes.get(n.id);
    if (b) nodes.set(n.id, b);
  }
  const byId = new Map(view.nodes.map((n) => [n.id, n]));
  const free = (b: Box) => ![...nodes.values()].some((o) => overlaps(b, o));
  const slot = (want: Box): Box => {
    // Try the wanted spot, then step away from it on alternating sides.
    const step = dir === 'RIGHT' ? want.h + PAD : want.w + PAD;
    for (let i = 0; i < 200; i++) {
      const off = Math.ceil(i / 2) * step * (i % 2 ? 1 : -1);
      const b = dir === 'RIGHT' ? { ...want, y: want.y + off } : { ...want, x: want.x + off };
      if (free(b)) return b;
    }
    return want;
  };
  // Upstream first, as expanding usually adds; then downstream of a placed node, which may open more upstream.
  for (;;) {
    let added = false;
    for (const e of view.edges) {
      if (nodes.has(e.source) || !nodes.has(e.target)) continue;
      const t = nodes.get(e.target)!;
      const { w, h } = sizeOf(byId.get(e.source)!);
      const want =
        dir === 'RIGHT'
          ? { x: t.x - GAP - w, y: t.y + t.h / 2 - h / 2, w, h }
          : { x: t.x + t.w / 2 - w / 2, y: t.y - GAP - h, w, h };
      nodes.set(e.source, slot(want));
      added = true;
    }
    if (added) continue;
    const down = view.edges.find((e) => nodes.has(e.source) && !nodes.has(e.target));
    if (!down) break;
    const s = nodes.get(down.source)!;
    const { w, h } = sizeOf(byId.get(down.target)!);
    const want =
      dir === 'RIGHT'
        ? { x: s.x + s.w + GAP, y: s.y + s.h / 2 - h / 2, w, h }
        : { x: s.x + s.w / 2 - w / 2, y: s.y + s.h + GAP, w, h };
    nodes.set(down.target, slot(want));
  }
  // Anything still unplaced has no placed neighbour; park it below.
  let bottom = Math.max(0, ...[...nodes.values()].map((b) => b.y + b.h));
  for (const n of view.nodes) {
    if (nodes.has(n.id)) continue;
    const { w, h } = sizeOf(n);
    nodes.set(n.id, { x: 0, y: bottom + GAP, w, h });
    bottom += GAP + h;
  }
  const edges = new Map<string, Pt[]>();
  for (const e of view.edges) {
    const old = prev.edges.get(e.id);
    if (old && prev.nodes.has(e.source) && prev.nodes.has(e.target)) {
      edges.set(e.id, old);
      continue;
    }
    const s = nodes.get(e.source)!;
    const t = nodes.get(e.target)!;
    if (dir === 'RIGHT') {
      const [sx, sy, tx, ty] = [s.x + s.w, s.y + s.h / 2, t.x, t.y + t.h / 2];
      const mx = tx - GAP / 2;
      edges.set(e.id, [
        { x: sx, y: sy },
        { x: mx, y: sy },
        { x: mx, y: ty },
        { x: tx, y: ty },
      ]);
    } else {
      const [sx, sy, tx, ty] = [s.x + s.w / 2, s.y + s.h, t.x + t.w / 2, t.y];
      const my = ty - GAP / 2;
      edges.set(e.id, [
        { x: sx, y: sy },
        { x: sx, y: my },
        { x: tx, y: my },
        { x: tx, y: ty },
      ]);
    }
  }
  // In spline mode the 4-point step renders as one smooth cubic curve.
  return { nodes, edges, routing: prev.routing, ms: 0 };
}
