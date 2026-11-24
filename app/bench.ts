// ELK timings, outside the browser.
//   node bench.ts
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';
import * as build from '../engine/view.ts';
import type { View } from '../engine/view.ts';
import type { LayoutOpts, Placement } from './src/graph/place.ts';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { layout } = (await server.ssrLoadModule('/src/graph/layout.ts')) as typeof import('./src/graph/layout.ts');
const { loadModel } = (await server.ssrLoadModule('/src/lib/data.ts')) as typeof import('./src/lib/data.ts');
const model = loadModel(readFileSync(new URL('../examples/model.yml', import.meta.url), 'utf8'));
const ids = [...model.things.keys()];
const opts: LayoutOpts = {
  direction: 'RIGHT',
  routing: 'ORTHOGONAL',
  placement: (process.env.PLACE ?? 'BRANDES_KOEPF') as Placement,
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

await server.close();
