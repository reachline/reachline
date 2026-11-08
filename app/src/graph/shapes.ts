// How a thing is drawn (its outline, its kind's icon and the room each part
// takes), and SVG paths for edges along their routes.
import type { Kind } from '../../../engine/model.ts';

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
/** Each end of a thing: room for a chevron (ThingNode), whether or not it has one. */
export const END = 16;
/** The kind's icon before a thing's name: its size, and the room it takes with a gap. */
export const ICON_SIZE = 13;
export const ICON = 18;
/** The status glyph after a thing's name, and the flag after that (as ThingNode draws them). */
export const GLYPH = 12;
export const FLAG = 10;
/** Room after a thing's name for whichever of them it has, with a 4px gap before them. */
export const statusWidth = (glyph: boolean, flag: boolean) =>
  glyph || flag ? 4 + (glyph ? GLYPH : 0) + (flag ? FLAG : 0) : 0;

/**
 * Each kind's icon, as the inside of a 24×24 Lucide SVG (stroke-width 2,
 * round caps and joins, no fill). Copied from Lucide 1.62 (ISC licence), so
 * the SVG export can draw them too.
 */
export const KIND_ICONS: Record<Kind, string> = {
  location:
    '<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>', // map-pin
  device:
    '<path d="M18 8V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h8"/><path d="M10 19v-3.96 3.15"/><path d="M7 19h5"/><rect width="6" height="10" x="16" y="12" rx="2"/>', // monitor-smartphone
  state: '<circle cx="15" cy="12" r="3"/><rect width="20" height="14" x="2" y="5" rx="7"/>', // toggle-right
  secret:
    '<path d="M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z"/><circle cx="16.5" cy="7.5" r=".5" fill="currentColor"/>', // key-round
  service: '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>', // cloud
  data: '<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>', // file-text
  account:
    '<path d="M17.925 20.056a6 6 0 0 0-11.851.001"/><circle cx="12" cy="11" r="4"/><circle cx="12" cy="12" r="10"/>', // circle-user-round
};

/** SVG path for a thing's outline, w x h, inset for the stroke: every kind alike, since its icon tells them apart. */
export function outline(w: number, h: number): string {
  const [x0, y0, x1, y1, r] = [1, 1, w - 1, h - 1, 7];
  return `M${x0 + r},${y0} H${x1 - r} Q${x1},${y0} ${x1},${y0 + r} V${y1 - r} Q${x1},${y1} ${x1 - r},${y1} H${x0 + r} Q${x0},${y1} ${x0},${y1 - r} V${y0 + r} Q${x0},${y0} ${x0 + r},${y0} Z`;
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
