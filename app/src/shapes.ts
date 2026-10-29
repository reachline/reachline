// SVG paths: node outlines by kind (echoing SHAPES in engine/mermaid.ts), and
// edges along their routes.
import type { NodeKind } from './build.ts';

export type Routing = 'ORTHOGONAL' | 'SPLINES' | 'POLYLINE';

export interface Pt {
  x: number;
  y: number;
}
export interface Box extends Pt {
  w: number;
  h: number;
}

/** Where a layout put a view's nodes and edges. */
export interface Placed {
  nodes: Map<string, Box>; // top-left corner
  edges: Map<string, Pt[]>; // start, bends..., end (absolute)
  routing: Routing;
  ms: number;
}

/** The graph's font: nodes are sized for it, and exports draw with it. */
export const FONT_FAMILY = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';
export const FONT = `12px ${FONT_FAMILY}`;
/**
 * Room before a thing's name for its status glyph, whenever a scenario is
 * shown: a 12px glyph and a 4px gap (as ThingNode draws them).
 */
export const STATUS_SLOT = 16;

/** SVG path for an HTML-rendered node of size w x h (inset for the stroke). */
export function shapePath(kind: NodeKind, w: number, h: number): string {
  const i = 1;
  const [x0, y0, x1, y1, ym] = [i, i, w - i, h - i, h / 2];
  const rect = (r: number) =>
    `M${x0 + r},${y0} H${x1 - r} Q${x1},${y0} ${x1},${y0 + r} V${y1 - r} Q${x1},${y1} ${x1 - r},${y1} H${x0 + r} Q${x0},${y1} ${x0},${y1 - r} V${y0 + r} Q${x0},${y0} ${x0 + r},${y0} Z`;
  switch (kind) {
    case 'location':
      return rect(ym - i);
    case 'device':
      return rect(7);
    case 'state':
      return `M${x0},${y0} H${x1} V${y1} H${x0} L${x0 + 9},${ym} Z`;
    case 'service':
      return `M${x0 + 9},${y0} H${x1 - 9} L${x1},${ym} L${x1 - 9},${y1} H${x0 + 9} L${x0},${ym} Z`;
    case 'data':
      return `M${x0 + 7},${y0} H${x1 - 7} Q${x1 + 1},${ym} ${x1 - 7},${y1} H${x0 + 7} Q${x0 - 1},${ym} ${x0 + 7},${y0} Z`;
    case 'account':
      return rect(0) + ` M${x0 + 6},${y0} V${y1} M${x1 - 6},${y0} V${y1}`;
    default:
      return rect(0);
  }
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
