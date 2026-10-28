// ELK timings and expand-on-click stability, outside the browser.
//   node bench.ts
import { createServer } from 'vite';
import type { View } from './src/build.ts';
import type { LayoutOpts, Placement } from './src/layout.ts';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const build = (await server.ssrLoadModule('/src/build.ts')) as typeof import('./src/build.ts');
const { layout } = (await server.ssrLoadModule('/src/layout.ts')) as typeof import('./src/layout.ts');
const model = ((await server.ssrLoadModule('/src/data.ts')) as typeof import('./src/data.ts')).loadModel();
const ids = [...model.things.keys()];
const opts: LayoutOpts = {
  direction: 'RIGHT',
  routing: 'ORTHOGONAL',
  placement: (process.env.PLACE ?? 'BRANDES_KOEPF') as Placement,
  stable: false,
};

async function time(view: View, label: string) {
  await layout(view, opts); // warm up
  const ms: number[] = [];
  for (let i = 0; i < 5; i++) {
    const t = performance.now();
    await layout(view, opts);
    ms.push(performance.now() - t);
  }
  ms.sort((a, b) => a - b);
  console.log(
    `${label.padEnd(26)} ${String(view.nodes.length).padStart(4)} nodes ${String(view.edges.length).padStart(4)} edges  median ${ms[2].toFixed(1)} ms`,
  );
}

console.log('ELK layout time');
await time(build.whereView(model), 'where things live');
await time(build.waysInView(model, ids, 'all'), 'everything');
// The four things with the most ways in.
const deepest = (t: string) => build.waysInView(model, [t], 'all').nodes.length;
for (const t of [...ids].sort((a, b) => deepest(b) - deepest(a)).slice(0, 4)) {
  await time(build.waysInView(model, [t], 'all'), `ways into ${t} (all)`);
}

// Start every critical thing at depth 2, then click each `+` in turn (BFS
// order), relaying out after each click with and without seeding positions.
console.log('\nexpand-on-click: share of on-screen nodes that move per click');
for (const stable of [false, true]) {
  let moved = 0,
    kept = 0,
    shift = 0,
    clicks = 0;
  for (const t of ids.filter((id) => model.things.get(id)!.critical)) {
    const expanded = build.expandToDepth(model, [t], 2);
    let view = build.waysInView(model, [t], expanded);
    let placed = await layout(view, { ...opts, stable });
    for (let step = 0; step < 6; step++) {
      const next = view.nodes.find((n) => n.more);
      if (!next) break;
      expanded.add(next.id);
      view = build.waysInView(model, [t], expanded);
      const after = await layout(view, { ...opts, stable }, placed);
      for (const [id, a] of placed.nodes) {
        const b = after.nodes.get(id);
        if (!b) continue;
        const d = Math.hypot(b.x - a.x, b.y - a.y);
        if (d > 1) moved++;
        else kept++;
        shift += d;
      }
      placed = after;
      clicks++;
    }
  }
  const pct = Math.round((100 * moved) / (moved + kept));
  console.log(
    `  stable=${stable}: ${clicks} clicks, ${pct}% of nodes moved, avg shift ${Math.round(shift / (moved + kept))}px`,
  );
}
await server.close();
