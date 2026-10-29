// Exporting the graph on screen: SVG drawn from its layout and shapes.ts (and
// PNG from that), and Mermaid from its view.
import { CLASSES, COMMON_CLASSES, SHAPES, type ScenarioKind } from '../../engine/mermaid.ts';
import { isJunction, type EdgeKind, type View, type VNode } from './build.ts';
import { FONT_FAMILY, routePath, shapePath, type Box, type Placed } from './shapes.ts';

/** A colour from app.css by its variable's name, such as 'k-device'. */
export type Colors = (name: string) => string;

const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => `&#${ch.charCodeAt(0)};`);

const PAD = 16;
const LEFT: Partial<Record<VNode['kind'], number>> = { state: 16, service: 14, account: 14 };
const DASH: Partial<Record<EdgeKind, string>> = { recovery: '6 4', needs: '2 3', mirror: '8 3 2 3' };

/** What ThingNode's styles give a node. */
function look(n: VNode, kind: string, c: Colors) {
  let [fill, stroke, text, width, dash] = [c('surface'), c(`k-${n.kind}`), c('text'), 1.5, ''];
  if (n.status === 'has') fill = c(kind === 'breach' ? 'bad-fill' : 'good-fill');
  else if (n.status === 'maybe') fill = c('maybe-fill');
  else if (n.status === 'lost') [fill, stroke, width] = [c('bad-fill'), c('bad-stroke'), 2.5];
  else if (n.status === 'gone') [fill, stroke, text, dash] = [c('gone-fill'), c('gone-stroke'), c('gone-text'), '4 3'];
  else if (n.status === 'start') [fill, stroke, text] = [c('start-fill'), c('start-stroke'), c('start-text')];
  if (n.root) width = 3;
  return { fill, stroke, text, width, dash };
}

/**
 * The graph as a standalone SVG: colours resolved and set as attributes, with
 * no stylesheet, so it looks the same wherever it's opened.
 */
export function toSvg(view: View, placed: Placed, kind: string, vertical: boolean, c: Colors) {
  const box = (id: string) => placed.nodes.get(id)!;
  const corners = view.nodes.flatMap((n) => {
    const b = box(n.id);
    return [b, { x: b.x + b.w, y: b.y + b.h }];
  });
  const pts = [...corners, ...view.edges.flatMap((e) => placed.edges.get(e.id) ?? [])];
  const x0 = Math.min(...pts.map((p) => p.x)) - PAD;
  const y0 = Math.min(...pts.map((p) => p.y)) - PAD;
  const width = Math.ceil(Math.max(...pts.map((p) => p.x)) + PAD - x0);
  const height = Math.ceil(Math.max(...pts.map((p) => p.y)) + PAD - y0);

  // One arrowhead per colour, as on screen.
  const arrows = new Map<string, string>();
  const arrow = (color: string) => arrows.get(color) ?? arrows.set(color, `a${arrows.size}`).get(color)!;
  // Where ELK gave no route, a straight line between the facing sides, as RoutedEdge draws it.
  const straight = (s: Box, t: Box) =>
    vertical
      ? `M${s.x + s.w / 2},${s.y + s.h} L${t.x + t.w / 2},${t.y}`
      : `M${s.x + s.w},${s.y + s.h / 2} L${t.x},${t.y + t.h / 2}`;

  const edges = view.edges.map((e) => {
    const color = c(e.live ? `e-${e.kind}` : 'e-dead');
    const d = routePath(placed.edges.get(e.id) ?? [], placed.routing) || straight(box(e.source), box(e.target));
    const dash = DASH[e.kind] ? ` stroke-dasharray="${DASH[e.kind]}"` : '';
    const head = e.kind === 'part' ? '' : ` marker-end="url(#${arrow(color)})"`;
    return `<path d="${d}" fill="none" stroke="${color}" stroke-width="${e.kind === 'part' ? 1 : 1.4}"${dash}${head}/>`;
  });

  const nodes = view.nodes.map((n) => {
    const { x, y, w, h } = box(n.id);
    if (isJunction(n.kind)) {
      const unknown = n.kind === 'unknown';
      const [fill, stroke] = unknown ? [c('maybe-fill'), c('maybe-stroke')] : [c('surface'), c('k-junction')];
      const dash = unknown ? ' stroke-dasharray="3 2"' : '';
      const text = unknown ? `font-size="12" fill="${c('maybe-stroke')}"` : `font-size="8" fill="${c('muted')}"`;
      return (
        `<g transform="translate(${x},${y})"><circle cx="${w / 2}" cy="${h / 2}" r="${w / 2 - 0.75}" fill="${fill}" stroke="${stroke}" stroke-width="1.5"${dash}/>` +
        `<text x="${w / 2}" y="${h / 2}" text-anchor="middle" dominant-baseline="central" font-weight="600" ${text}>${esc(n.label)}</text></g>`
      );
    }
    const s = look(n, kind, c);
    const dash = s.dash ? ` stroke-dasharray="${s.dash}"` : '';
    const right = w - (n.kind === 'account' ? 12 : 7);
    const mark = n.more
      ? `<text x="${right}" y="${h / 2}" text-anchor="end" dominant-baseline="central" font-weight="700" fill="${c('muted')}">+</text>`
      : n.row
        ? `<text x="${right}" y="${h / 2}" text-anchor="end" dominant-baseline="central" font-weight="700" fill="${c('bad-stroke')}">!</text>`
        : '';
    return (
      `<g transform="translate(${x},${y})"><path d="${shapePath(n.kind, w, h)}" fill="${s.fill}" stroke="${s.stroke}" stroke-width="${s.width}"${dash}/>` +
      `<text x="${LEFT[n.kind] ?? 12}" y="${h / 2}" dominant-baseline="central" fill="${s.text}">${esc(n.label)}</text>${mark}</g>`
    );
  });

  const defs = [...arrows].map(
    ([color, id]) =>
      `<marker id="${id}" viewBox="-10 -10 20 20" markerWidth="14" markerHeight="14" markerUnits="userSpaceOnUse" orient="auto-start-reverse">` +
      `<polyline points="-5,-4 0,0 -5,4 -5,-4" fill="${color}" stroke="${color}" stroke-width="1" stroke-linejoin="round"/></marker>`,
  );
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${x0} ${y0} ${width} ${height}" font-family="${esc(FONT_FAMILY)}" font-size="12">`,
    `<defs>${defs.join('')}</defs>`,
    `<rect x="${x0}" y="${y0}" width="${width}" height="${height}" fill="${c('bg')}"/>`,
    ...edges,
    ...nodes,
    '</svg>',
  ].join('\n');
  return { svg, width, height };
}

const ARROWS: Record<EdgeKind, string> = {
  in: '-->',
  access: '-->',
  part: '-->',
  needs: '-.->|needs|',
  mirror: '-.->|mirror|',
  recovery: '-.->|recovery|',
};

/** The graph as a Mermaid flowchart, styled like the engine's charts; Mermaid lays it out itself. */
export function toMermaid(view: View, vertical: boolean, kind: string): string {
  // Junction ids are internal, and not all are valid in Mermaid.
  const ids = new Map(view.nodes.map((n, i) => [n.id, isJunction(n.kind) ? `j${i}` : n.id]));
  const styles = { ...(kind in CLASSES ? CLASSES[kind as ScenarioKind] : {}), ...COMMON_CLASSES };
  const members = new Map<string, string[]>();
  const out = [`flowchart ${vertical ? 'TB' : 'LR'}`];
  for (const n of view.nodes) {
    const id = ids.get(n.id)!;
    const [a, b] = isJunction(n.kind) ? ['(("', '"))'] : SHAPES[n.kind];
    out.push(`  ${id}${a}${n.label}${b}`);
    const cls =
      n.kind === 'unknown'
        ? 'unknown'
        : isJunction(n.kind)
          ? 'junction'
          : [n.status, n.more && 'more'].find((s) => s && s in styles);
    if (cls) members.set(cls, [...(members.get(cls) ?? []), id]);
  }
  for (const e of view.edges) out.push(`  ${ids.get(e.source)} ${ARROWS[e.kind]} ${ids.get(e.target)}`);
  const dead = view.edges.flatMap((e, i) => (e.live ? [] : [i]));
  if (dead.length) out.push(`  linkStyle ${dead.join(',')} stroke:#d6d6d6`);
  for (const [name, style] of Object.entries(styles)) {
    const ms = members.get(name);
    if (ms) out.push(`  classDef ${name} ${style}`, `  class ${ms.join(',')} ${name}`);
  }
  return out.join('\n') + '\n';
}

/** PNG of an SVG, at twice its size where the browser's canvas allows. */
export async function toPng(svg: string, width: number, height: number): Promise<Blob> {
  const scale = Math.min(2, Math.sqrt(16e6 / (width * height)));
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise((ok, fail) =>
      canvas.toBlob((b) => (b ? ok(b) : fail(new Error('The PNG could not be made'))), 'image/png'),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Saves `data` as a file named after `name`. */
export function download(name: string, data: Blob) {
  const url = URL.createObjectURL(data);
  const a = document.createElement('a');
  a.href = url;
  a.download = name.replace(/[\\/:*?"<>|]+/g, '-');
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
