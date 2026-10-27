// Node outlines by section, echoing SHAPES in engine/mermaid.ts.
import type { NodeKind } from './build';

/** SVG path for an HTML-rendered node of size w x h (inset for the stroke). */
export function shapePath(kind: NodeKind, w: number, h: number): string {
  const i = 1;
  const [x0, y0, x1, y1, ym] = [i, i, w - i, h - i, h / 2];
  const rect = (r: number) =>
    `M${x0 + r},${y0} H${x1 - r} Q${x1},${y0} ${x1},${y0 + r} V${y1 - r} Q${x1},${y1} ${x1 - r},${y1} H${x0 + r} Q${x0},${y1} ${x0},${y1 - r} V${y0 + r} Q${x0},${y0} ${x0 + r},${y0} Z`;
  switch (kind) {
    case 'locations': return rect(ym - i);
    case 'devices': return rect(7);
    case 'states': return `M${x0},${y0} H${x1} V${y1} H${x0} L${x0 + 9},${ym} Z`;
    case 'services': return `M${x0 + 9},${y0} H${x1 - 9} L${x1},${ym} L${x1 - 9},${y1} H${x0 + 9} L${x0},${ym} Z`;
    case 'data': return `M${x0 + 7},${y0} H${x1 - 7} Q${x1 + 1},${ym} ${x1 - 7},${y1} H${x0 + 7} Q${x0 - 1},${ym} ${x0 + 7},${y0} Z`;
    case 'accounts': return rect(0) + ` M${x0 + 6},${y0} V${y1} M${x1 - 6},${y0} V${y1}`;
    default: return rect(0);
  }
}
