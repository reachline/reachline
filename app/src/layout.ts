// ELK layered layout for a view, plus in-place placement for expanding
// without moving anything.
import ElkApi, { type ELK, type ElkNode } from 'elkjs/lib/elk-api.js';
import workerUrl from 'elkjs/lib/elk-worker.min.js?url';
import { isJunction, type View, type VNode } from './build';

export const FONT = '12px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';
const THING_H = 28;
const JUNCTION = 24;

export type Direction = 'RIGHT' | 'DOWN';
export type Routing = 'ORTHOGONAL' | 'SPLINES' | 'POLYLINE';
// Network simplex gives straighter edges; Brandes-Köpf is about 7x faster here.
export type Placement = 'NETWORK_SIMPLEX' | 'BRANDES_KOEPF';

export interface LayoutOpts {
  direction: Direction;
  routing: Routing;
  placement: Placement;
  stable?: boolean; // seed ELK with the previous positions (interactive mode; bench.ts compares it)
}

export interface Pt {
  x: number;
  y: number;
}
export interface Box extends Pt {
  w: number;
  h: number;
}

export interface Placed {
  nodes: Map<string, Box>; // top-left corner
  edges: Map<string, Pt[]>; // start, bends..., end (absolute)
  routing: Routing;
  ms: number;
}

// In the page, ELK runs in a web worker so a big layout doesn't freeze the UI.
// bench.ts loads this through Vite's SSR in Node, where there are no web
// workers, so there it runs inline (and the page's build leaves that out).
let elk: Promise<ELK> | undefined;
const getElk = () =>
  (elk ??= import.meta.env.SSR
    ? import('elkjs/lib/elk.bundled.js').then((m) => new m.default())
    : Promise.resolve(new ElkApi({ workerUrl })));
let ctx: CanvasRenderingContext2D | null = null;

export function sizeOf(n: VNode): { w: number; h: number } {
  if (isJunction(n.kind)) return { w: JUNCTION, h: JUNCTION };
  // Room on the right for the expand/status marker.
  const bars = n.kind === 'accounts' ? 8 : 0;
  // Outside a browser (bench.ts), estimate the text width.
  if (typeof document === 'undefined') return { w: n.label.length * 7 + 34 + bars, h: THING_H };
  ctx ??= document.createElement('canvas').getContext('2d')!;
  ctx.font = FONT;
  return { w: Math.ceil(ctx.measureText(n.label).width) + 34 + bars, h: THING_H };
}

/** Where to put a node ELK hasn't seen: just upstream of what it feeds into. */
function seed(view: View, prev: Map<string, Box>, dir: Direction): Map<string, Pt> {
  const pos = new Map<string, Pt>();
  for (const n of view.nodes) {
    const p = prev.get(n.id);
    if (p) pos.set(n.id, { x: p.x, y: p.y });
  }
  for (let added = true; added;) {
    added = false;
    for (const e of view.edges) {
      if (pos.has(e.source) || !pos.has(e.target)) continue;
      const t = pos.get(e.target)!;
      pos.set(e.source, dir === 'RIGHT' ? { x: t.x - 160, y: t.y } : { x: t.x, y: t.y - 90 });
      added = true;
    }
  }
  return pos;
}

export async function layout(view: View, opts: LayoutOpts, prev?: Placed | null): Promise<Placed> {
  const t0 = performance.now();
  const seeds = opts.stable && prev ? seed(view, prev.nodes, opts.direction) : null;
  const interactive: Record<string, string> = seeds
    ? {
        'elk.layered.cycleBreaking.strategy': 'INTERACTIVE',
        'elk.layered.layering.strategy': 'INTERACTIVE',
        'elk.layered.crossingMinimization.strategy': 'INTERACTIVE',
        'elk.layered.nodePlacement.strategy': 'INTERACTIVE',
      }
    : {};
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
      ...interactive,
    },
    children: view.nodes.map((n) => {
      const { w, h } = sizeOf(n);
      const p = seeds?.get(n.id);
      return { id: n.id, width: w, height: h, ...(p ? { x: p.x, y: p.y } : {}) };
    }),
    edges: view.edges.map((e) => ({ id: e.id, sources: [e.source], targets: [e.target] })),
  };
  const out = await (await getElk()).layout(graph);
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

/** SVG path for an ELK route. Spline routes are cubic Bézier control points. */
export function routePath(pts: Pt[], routing: Routing): string {
  if (pts.length < 2) return '';
  const [s, ...rest] = pts;
  if (routing === 'SPLINES' && rest.length % 3 === 0) {
    let d = `M${s.x},${s.y}`;
    for (let i = 0; i < rest.length; i += 3) {
      const [a, b, c] = rest.slice(i, i + 3);
      d += ` C${a.x},${a.y} ${b.x},${b.y} ${c.x},${c.y}`;
    }
    return d;
  }
  return `M${s.x},${s.y}` + rest.map((p) => ` L${p.x},${p.y}`).join('');
}

const GAP = 36; // between a new node and what it feeds into
const PAD = 8; // clearance kept around every node

const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.w + PAD && b.x < a.x + a.w + PAD && a.y < b.y + b.h + PAD && b.y < a.y + a.h + PAD;

/**
 * Add the view's new nodes without moving anything already placed: each goes
 * just upstream of what it feeds into, in the nearest free slot. Edges that
 * already had an ELK route keep it; new ones get a simple stepped route.
 */
export function placeLocally(view: View, prev: Placed, dir: Direction): Placed {
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
  for (let added = true; added;) {
    added = false;
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
  }
  // Anything still unplaced has no placed node downstream; park it below.
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
