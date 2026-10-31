// Mermaid flowcharts: where things live, every way into a thing, and the
// paths a scenario uses.
import { refs, split, UNKNOWN, type Cond } from './cond.ts';
import { availability, type Best, type Kind, type Model } from './model.ts';
import { what } from './report.ts';

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

/** Collects nodes and edges for one flowchart. */
class Mermaid {
  nodes = new Map<string, string>();
  edges: string[] = [];
  classes = new Map<string, string>();
  n = 0;
  // With a scenario's reach, edges that can't carry access get faded.
  dead = new Set<number>();

  readonly m: Model;
  readonly direction: string;
  readonly best: Best | null;

  constructor(m: Model, direction = 'LR', best: Best | null = null) {
    this.m = m;
    this.direction = direction;
    this.best = best;
  }

  ok(tid: string): boolean {
    return this.best === null || this.best.has(tid);
  }

  node(tid: string): string {
    if (!this.nodes.has(tid)) {
      const [a, b] = SHAPES[this.m.things.get(tid)!.kind];
      this.nodes.set(tid, `${tid}${a}${tid}${b}`);
    }
    return tid;
  }

  junction(label: string, cls = 'junction'): string {
    const jid = `j${++this.n}`;
    this.nodes.set(jid, `${jid}(("${label}"))`);
    this.classes.set(jid, cls);
    return jid;
  }

  edge(a: string, b: string, arrow = '-->', live = true) {
    const e = `${a} ${arrow} ${b}`;
    let i = this.edges.indexOf(e);
    if (i < 0) i = this.edges.push(e) - 1;
    if (!live) this.dead.add(i);
  }

  /** The node standing for a condition, and whether it holds by `ok` (an unknown might, so it counts). */
  cond(c: Cond, ok: (id: string) => boolean = (id) => this.ok(id)): [string, boolean] {
    if (c === UNKNOWN) return [this.junction(UNKNOWN, 'unknown'), true];
    if (typeof c === 'string') return [this.node(c), ok(c)];
    const j = this.junction(c.op.toUpperCase());
    const oks = c.of.map((x) => {
      const [nid, live] = this.cond(x, ok);
      this.edge(nid, j, undefined, live);
      return live;
    });
    return [j, c.op === 'or' ? oks.some(Boolean) : oks.every(Boolean)];
  }

  /** Edges into target from a condition: each top-level option of access or
   *  recovery, or each top-level requirement of needs, is an edge of its own. */
  into(c: Cond | null, op: 'and' | 'or', target: string, arrow: string, ok?: (id: string) => boolean) {
    for (const part of c === null ? [] : split(c, op)) {
      const [nid, live] = this.cond(part, ok);
      this.edge(nid, this.node(target), arrow, live);
    }
  }

  color(kind: string, best: Best, avail: Map<string, boolean>, start: readonly string[] = []) {
    for (const tid of this.nodes.keys()) {
      if (!this.m.things.has(tid)) continue;
      if (!avail.get(tid)) this.classes.set(tid, 'gone');
      else if (start.includes(tid) && kind === 'breach') this.classes.set(tid, 'start');
      else if (best.has(tid)) this.classes.set(tid, best.get(tid)!.a.length ? 'maybe' : 'has');
    }
  }

  render(kind: string | null = null, title: string | null = null): string {
    const out: string[] = [];
    if (title) out.push('---', `title: "${title}"`, '---');
    out.push(`flowchart ${this.direction}`);
    for (const n of this.nodes.values()) out.push(`  ${n}`);
    for (const e of this.edges) out.push(`  ${e}`);
    if (this.dead.size) out.push(`  linkStyle ${[...this.dead].sort((a, b) => a - b).join(',')} stroke:#d6d6d6`);
    const styles = { ...(kind && kind in CLASSES ? CLASSES[kind as ScenarioKind] : {}), ...COMMON_CLASSES };
    for (const [name, style] of Object.entries(styles)) {
      const members = [...this.classes].filter(([, c]) => c === name).map(([t]) => t);
      if (members.length) out.push(`  classDef ${name} ${style}`, `  class ${members.join(',')} ${name}`);
    }
    return out.join('\n');
  }
}

/** Containment (in) and dependencies (needs) for everything that has them. */
export function mermaidWhere(m: Model): string {
  const mm = new Mermaid(m);
  for (const [tid, spec] of m.things) {
    for (const c of spec.in) mm.edge(c === UNKNOWN ? mm.junction(UNKNOWN, 'unknown') : mm.node(c), mm.node(tid));
    mm.into(spec.needs, 'and', tid, '-.->|needs|');
    if (spec.mirrors) {
      mm.edge(mm.node(spec.mirrors.of), mm.node(tid), `-.->|"mirrored by ${spec.mirrors.by}"|`);
    }
  }
  return mm.render(null, 'Where things live');
}

/**
 * Every way into target, recursively: in, needs, access, recovery.
 *
 * With a scenario, nodes are colored by its reach and edges that can't carry
 * access in it are faded, so every way in that works stays solid.
 */
export function mermaidWaysIn(
  m: Model,
  target: string,
  scenario: string | null = null,
  depth: number | null = null,
): string {
  const run = scenario ? m.run(scenario) : null;
  const avail = run ? availability(m.things, new Set(run.sc.lost)) : null;
  const mm = new Mermaid(m, 'LR', run?.best ?? null);
  const seen = new Set<string>();
  const frontier: [string, number][] = [[target, 0]];
  while (frontier.length) {
    const [tid, d] = frontier.shift()!;
    if (seen.has(tid)) continue;
    seen.add(tid);
    mm.node(tid);
    const spec = m.things.get(tid)!;
    const mir = spec.mirrors ? [spec.mirrors.of] : [];
    const ins = [
      ...spec.in.filter((c) => c !== UNKNOWN),
      ...refs(spec.needs),
      ...mir,
      ...refs(spec.access),
      ...refs(spec.recovery),
    ];
    if (depth !== null && d >= depth) {
      if (ins.length) mm.classes.set(tid, 'more');
      continue;
    }
    mm.into(spec.in.length ? { op: 'or', of: spec.in } : null, 'or', tid, '-->');
    mm.into(spec.needs, 'and', tid, '-.->|needs|', (n) => avail === null || avail.get(n)!);
    for (const n of mir) mm.edge(mm.node(n), tid, `-.->|"mirrored by ${spec.mirrors!.by}"|`);
    mm.into(spec.access, 'or', tid, '-->');
    mm.into(spec.recovery, 'or', tid, '-.->|recovery|');
    frontier.push(...ins.map((r): [string, number] => [r, d + 1]));
  }
  if (run) mm.color(run.sc.kind, run.best, avail!, m.start(run.sc));
  const title = `Ways into ${target}` + (scenario ? ` (${scenario}; faded = doesn't work here)` : '');
  return mm.render(run?.sc.kind ?? null, title);
}

/** The paths a scenario actually uses to reach each flagged thing. */
export function mermaidScenario(m: Model, name: string): string {
  const { sc, best } = m.run(name);
  const mm = new Mermaid(m);
  const done = new Set<string>();
  const walk = (tid: string): void => {
    if (done.has(tid)) return;
    done.add(tid);
    mm.node(tid);
    const { why } = best.get(tid)!;
    if (why.kind === 'start' || why.kind === 'state') return;
    const arrow = why.kind === 'recovery' ? '-.->|recovery|' : '-->';
    const picks = (why.kind === 'in' ? [why.via] : why.uses).map((x) => {
      if (x === UNKNOWN) return mm.junction(UNKNOWN, 'unknown');
      walk(x);
      return x;
    });
    if (picks.length === 1) {
      mm.edge(picks[0], tid, arrow);
    } else {
      const j = mm.junction('AND');
      for (const p of picks) mm.edge(p, j);
      mm.edge(j, tid, arrow);
    }
  };
  let targets = [...m.things].filter(([, s]) => s.check.includes(sc.kind)).map(([t]) => t);
  if (sc.kind === 'breach') {
    const rows = m.rows(name);
    targets = targets.filter((t) => rows.has(t));
  }
  for (const t of targets) {
    if (best.has(t)) walk(t);
    else mm.node(t);
  }
  mm.color(sc.kind, best, availability(m.things, new Set(sc.lost)), m.start(sc));
  for (const t of targets) if (!best.has(t)) mm.classes.set(t, 'lost');
  return mm.render(sc.kind, `${name}: ${what(sc)} (one path per item; alternatives not shown)`);
}

/** where + every scenario, as Markdown. `plans` are the names of the plans applied. */
export function mermaidAll(m: Model, plans: string[]): string {
  const planned = plans.length ? ` (with ${plans.join(', ')})` : '';
  const out = [`# Access model${planned}`, '', 'Generated by `reach.ts --mermaid all`.', ''];
  const sections: [string, string][] = [['Where things live', mermaidWhere(m)]];
  for (const name of m.scenarios.keys()) sections.push([name, mermaidScenario(m, name)]);
  for (const [heading, chart] of sections) out.push(`## ${heading}`, '', '```mermaid', chart, '```', '');
  return out.join('\n');
}
