// The text reports: one scenario, a plan's before/after, how one thing is
// reached, and open questions. Each returns lines; the CLI prints them.
import { fmtSet, fmtWhy, refs, type Best, type Model, type Row, type Scenario } from './model.ts';

export function what(sc: Scenario): string {
  return sc.kind === 'lockout'
    ? `lost ${(sc.lost ?? []).join(', ') || 'nothing'}`
    : `attacker has ${(sc.attacker ?? []).join(', ')}`;
}

export function header(sc: Scenario, name: string): string[] {
  const out = ['', `${name}  (${sc.kind}: ${what(sc)})`];
  for (const field of ['assume', 'deny'] as const) {
    if (sc[field]?.length) out.push(`  ${field}: ${sc[field].join(', ')}`);
  }
  if (sc.note) out.push(`  # ${sc.note}`);
  return out;
}

export function report(m: Model, name: string): string[] {
  const out = header(m.scenario(name), name);
  const rows = m.rows(name);
  for (const [t, [st, how]] of rows) out.push(`  ${t.padEnd(14)} ${st}  ${how}`.trimEnd());
  if (!rows.size) out.push('  ok');
  return out;
}

export function diff(before: Model, after: Model, names: string[]): string[] {
  const out: string[] = [];
  for (const name of names) {
    if (!after.scenarios.has(name)) {
      out.push('', `${name}  (removed by plan)`);
      continue;
    }
    out.push(...header(after.scenario(name), name));
    const rb: Map<string, Row> = before.scenarios.has(name) ? before.rows(name) : new Map();
    const ra = after.rows(name);
    const status = (rows: Map<string, Row>, t: string) => rows.get(t)?.[0] ?? 'ok';
    const changed = [...new Set([...rb.keys(), ...ra.keys()])].filter((t) => status(rb, t) !== status(ra, t));
    for (const t of changed) {
      out.push(`  ${t.padEnd(14)} ${status(rb, t)}  →  ${status(ra, t)}  ${ra.get(t)?.[1] ?? ''}`.trimEnd());
    }
    const still = [...ra.keys()].filter((t) => !changed.includes(t));
    if (still.length) out.push(`  ${'still'.padEnd(14)} ${still.join(', ')}`);
    if (!changed.length && !still.length) out.push('  ok');
    else if (!changed.length) out.push('  (no change)');
  }
  return out;
}

function statusOf(m: Model, tid: string, best: Best): string {
  const e = best.get(tid);
  if (!e) return 'no';
  return e.a.length ? m.fmtUnknowns(e.a) : 'yes';
}

/** Of the options for one element, the reached one with fewest assumptions. */
export function pick(options: readonly unknown[], best: Best): string | undefined {
  let min: string | undefined;
  for (const x of options) {
    if (typeof x !== 'string' || x === '?' || !best.has(x)) continue;
    if (min === undefined || best.get(x)!.a.length < best.get(min)!.a.length) min = x;
  }
  return min;
}

/** The path a scenario uses to reach target, or its ways in if it can't. */
export function explain(m: Model, name: string, target: string): string[] {
  const { best } = m.run(name);
  const out: string[] = [];
  if (!best.has(target)) {
    out.push(`${target} not reachable in ${name}. Its ways in:`);
    const spec = m.things.get(target)!;
    for (const c of spec.in) out.push(`  in ${c}: ${statusOf(m, c, best)}`);
    for (const kind of ['access', 'recovery'] as const) {
      for (const s of spec[kind]) {
        out.push(`  ${kind} ${fmtSet(s)}`);
        for (const r of [...new Set(refs(s))].sort()) out.push(`      ${r}: ${statusOf(m, r, best)}`);
      }
    }
    return out;
  }
  const seen = new Set<string>();
  const walk = (tid: string, depth: number): void => {
    const { a, why } = best.get(tid)!;
    const note = a.length ? `  ${m.fmtUnknowns(a)}` : '';
    out.push('  '.repeat(depth) + `${tid}  [${fmtWhy(why)}]${note}` + (seen.has(tid) ? '  (above)' : ''));
    if (seen.has(tid) || why.kind === 'start' || why.kind === 'state') return;
    seen.add(tid);
    if (why.kind === 'in') return walk(why.via, depth + 1);
    for (const e of why.via) {
      const x = pick(Array.isArray(e) ? e : [e], best);
      if (x !== undefined) walk(x, depth + 1);
      else out.push('  '.repeat(depth + 1) + '?');
    }
  };
  walk(target, 0);
  return out;
}

export function todo(m: Model): string[] {
  const out: string[] = [];
  for (const [tid, spec] of m.things) {
    if (spec.todo) out.push(`${tid}: ${String(spec.todo).split(/\s+/).filter(Boolean).join(' ')}`);
  }
  return out;
}
