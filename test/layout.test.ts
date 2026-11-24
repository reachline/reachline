// Changes to a laid-out graph keep its layout: choosing a scenario, expanding
// and renaming move nothing but to make room, on real ELK layouts.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { expandToDepth, outcome, waysInView, whereView, type Outcome, type View } from '../engine/view.ts';
import { edit, renameThing } from '../app/src/lib/edit.ts';
import { loadModel } from '../app/src/lib/data.ts';
import {
  elkLayout,
  placeLocally,
  renamed,
  resize,
  sizeOf,
  type Box,
  type Direction,
  type Placed,
  type Routing,
} from '../app/src/graph/place.ts';

// elkjs is the app's dependency, so it's found from there; this build runs inline, as in bench.ts.
type ELK = Parameters<typeof elkLayout>[0];
const bundled = createRequire(new URL('../app/package.json', import.meta.url))('elkjs/lib/elk.bundled.js') as {
  default: new () => ELK;
};
const elk = new bundled.default();

const text = readFileSync(new URL('../examples/model.yml', import.meta.url), 'utf8');
const model = loadModel(text);
const scenarios = [...model.scenarios.keys()];
const lockouts = [...model.things.keys()].filter((id) => model.things.get(id)!.check.includes('lockout'));

const fresh = (v: View, direction: Direction, routing: Routing) =>
  elkLayout(elk, v, { direction, routing, placement: 'BRANDES_KOEPF' });
/** What the app does with a view that changed, short of Tidy. */
const next = (v: View, prev: Placed, dir: Direction) => placeLocally(v, resize(v, prev), dir);

const near = (a: number, b: number) => Math.abs(a - b) < 0.5;
const onBox = (p: { x: number; y: number }, b: Box) =>
  p.x > b.x - 1 && p.x < b.x + b.w + 1 && p.y > b.y - 1 && p.y < b.y + b.h + 1;

/** What any layout must be: nodes at their size and apart, and every edge drawn from its source to its target. */
function assertSound(v: View, p: Placed, what: string) {
  const boxes = v.nodes.map((n) => [n.id, p.nodes.get(n.id)!] as const);
  for (const n of v.nodes) {
    const b = p.nodes.get(n.id);
    assert.ok(b, `${what}: ${n.id} is placed`);
    assert.deepEqual({ w: b.w, h: b.h }, sizeOf(n), `${what}: ${n.id} is its size`);
  }
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const [[m, a], [n, b]] = [boxes[i], boxes[j]];
      const apart =
        a.x + a.w <= b.x + 0.5 || b.x + b.w <= a.x + 0.5 || a.y + a.h <= b.y + 0.5 || b.y + b.h <= a.y + 0.5;
      assert.ok(apart, `${what}: ${m} and ${n} overlap`);
    }
  for (const e of v.edges) {
    const pts = p.edges.get(e.id) ?? [];
    assert.ok(pts.length >= 2, `${what}: ${e.id} is drawn`);
    assert.ok(onBox(pts[0], p.nodes.get(e.source)!), `${what}: ${e.id} starts on its source`);
    assert.ok(onBox(pts.at(-1)!, p.nodes.get(e.target)!), `${what}: ${e.id} ends on its target`);
    if (p.routing === 'ORTHOGONAL')
      for (let k = 1; k < pts.length; k++)
        assert.ok(near(pts[k].x, pts[k - 1].x) || near(pts[k].y, pts[k - 1].y), `${what}: ${e.id} stays orthogonal`);
  }
}

/** No two nodes that both layouts place trade places, across or along the graph. */
function assertSameOrder(a: Placed, b: Placed, what: string) {
  const ids = [...a.nodes.keys()].filter((id) => b.nodes.has(id));
  for (const axis of ['x', 'y'] as const)
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++) {
        const before = a.nodes.get(ids[i])![axis] - a.nodes.get(ids[j])![axis];
        const after = b.nodes.get(ids[i])![axis] - b.nodes.get(ids[j])![axis];
        assert.ok(before * after >= 0 || near(before, 0) || near(after, 0), `${what}: ${ids[i]} and ${ids[j]} swap`);
      }
}

const views: [string, (sc?: Outcome) => View][] = [
  ['where things live', (sc) => whereView(model, sc)],
  ['everything', (sc) => waysInView(model, [...model.things.keys()], 'all', sc)],
];

test('choosing scenarios keeps the layout, and choosing none puts it back as it was', async () => {
  for (const [name, view] of views)
    for (const dir of ['RIGHT', 'DOWN'] as const)
      for (const routing of ['ORTHOGONAL', 'SPLINES'] as const) {
        const none = view();
        const start = await fresh(none, dir, routing);
        let p = start;
        for (const s of scenarios) {
          const what = `${name}, ${dir}, ${routing}, ${s}`;
          const v = view(outcome(model, s));
          const q = next(v, p, dir);
          assertSound(v, q, what);
          assertSameOrder(start, q, what);
          for (const [id, b] of start.nodes) assert.equal(q.nodes.get(id)!.y, b.y, `${what}: ${id} keeps its row`);
          p = q;
        }
        const back = next(none, p, dir);
        for (const [id, b] of start.nodes) assert.deepEqual(back.nodes.get(id), b, `${name}, ${dir}: ${id} is back`);
      }
});

test('expanding moves nothing already placed, with or without a scenario', async () => {
  for (const dir of ['RIGHT', 'DOWN'] as const)
    for (const root of lockouts) {
      const expanded = expandToDepth(model, [root], 2);
      let sc: Outcome | undefined;
      let v = waysInView(model, [root], expanded);
      let p = await fresh(v, dir, 'ORTHOGONAL');
      for (let i = 0; i < 8; i++) {
        const what = `${root}, ${dir}, step ${i}`;
        const opening = i % 2 === 0;
        if (opening) {
          const more = v.nodes.find((n) => n.more);
          if (more) expanded.add(more.id);
        } else sc = sc ? undefined : outcome(model, scenarios[i % scenarios.length]);
        const w = waysInView(model, [root], expanded, sc);
        const q = next(w, p, dir);
        assertSound(w, q, what);
        if (opening) for (const [id, b] of p.nodes) assert.deepEqual(q.nodes.get(id), b, `${what}: ${id} stays`);
        [v, p] = [w, q];
      }
    }
});

test('a renamed thing, and the junctions into it, keep their place and their routes', async () => {
  let checked = 0;
  for (const dir of ['RIGHT', 'DOWN'] as const)
    for (const root of lockouts) {
      const v = waysInView(model, [root], 'all');
      const p = await fresh(v, dir, 'ORTHOGONAL');
      const from = v.nodes.find((n) => n.id !== root && v.nodes.some((j) => j.id.startsWith(`${n.id}/`)))?.id;
      if (!from) continue;
      const to = `${from}_with_a_longer_name`;
      const w = waysInView(loadModel(edit(text, renameThing(from, to))), [root], 'all');
      const q = next(w, renamed(p, v, from, to), dir);
      const what = `${root}, ${dir}, ${from}`;
      assertSound(w, q, what);
      const was = (id: string) => (id === to || id.startsWith(`${to}/`) ? from + id.slice(to.length) : id);
      assertSameOrder(p, renamed(q, w, to, from), what);
      for (const n of w.nodes)
        assert.equal(q.nodes.get(n.id)!.y, p.nodes.get(was(n.id))!.y, `${what}: ${n.id} keeps its row`);
      assert.ok(q.nodes.get(to)!.w > p.nodes.get(from)!.w, `${what}: ${to} is wider`);
      // Routes kept, not redrawn: each bend's row is still there.
      for (const e of w.edges.filter((e) => e.source === to || e.target === to)) {
        const old = v.edges.find((o) => o.kind === e.kind && was(e.source) === o.source && was(e.target) === o.target)!;
        const ys = new Set(q.edges.get(e.id)!.map((pt) => Math.round(pt.y)));
        for (const pt of p.edges.get(old.id)!) assert.ok(ys.has(Math.round(pt.y)), `${what}: ${e.id} keeps its route`);
      }
      checked++;
    }
  assert.ok(checked > 0, 'some thing with junctions into it was renamed');
});
