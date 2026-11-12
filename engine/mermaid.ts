// A view of the model (view.ts) as a Mermaid flowchart, for the app's export.
import type { Kind } from './model.ts';
import { isJunction, type EdgeKind, type View } from './view.ts';

export const SHAPES: Record<Kind, [string, string]> = {
  location: ['(["', '"])'],
  device: ['("', '")'],
  state: ['>"', '"]'],
  secret: ['["', '"]'],
  service: ['{{"', '"}}'],
  data: ['[("', '")]'],
  account: ['[["', '"]]'],
};

export type ScenarioKind = 'lockout' | 'breach';

export const CLASSES: Record<ScenarioKind, Record<string, string>> = {
  lockout: {
    has: 'fill:#d4edda,stroke:#2e7d32',
    maybe: 'fill:#fff3cd,stroke:#b8860b',
    lost: 'fill:#f8d7da,stroke:#c62828,stroke-width:2px',
  },
  breach: {
    has: 'fill:#f8d7da,stroke:#c62828',
    maybe: 'fill:#fff3cd,stroke:#b8860b',
    start: 'fill:#424242,stroke:#000,color:#fff',
  },
};
export const COMMON_CLASSES: Record<string, string> = {
  gone: 'fill:#eeeeee,stroke:#9e9e9e,color:#9e9e9e,stroke-dasharray:4 3',
  junction: 'fill:#ffffff,stroke:#9e9e9e,color:#616161',
  unknown: 'fill:#fff3cd,stroke:#b8860b,stroke-dasharray:4 3',
  more: 'stroke-dasharray:2 2',
};

const ARROWS: Record<EdgeKind, string> = {
  in: '-->',
  access: '-->',
  part: '-->',
  needs: '-.->|needs|',
  mirror: '-.->|mirror|',
  recovery: '-.->|recovery|',
};

/** A view as a Mermaid flowchart, coloured for the scenario's kind (or none); Mermaid lays it out itself. */
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
  for (const e of view.edges) {
    const arrow = e.by ? `-.->|"mirrored by ${e.by}"|` : ARROWS[e.kind];
    out.push(`  ${ids.get(e.source)} ${arrow} ${ids.get(e.target)}`);
  }
  const dead = view.edges.flatMap((e, i) => (e.live ? [] : [i]));
  if (dead.length) out.push(`  linkStyle ${dead.join(',')} stroke:#d6d6d6`);
  for (const [name, style] of Object.entries(styles)) {
    const ms = members.get(name);
    if (ms) out.push(`  classDef ${name} ${style}`, `  class ${ms.join(',')} ${name}`);
  }
  return out.join('\n');
}
