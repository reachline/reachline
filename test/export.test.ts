// Exporting the graph on screen as SVG and Mermaid.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { CLASSES } from '../engine/mermaid.ts';
import { expandToDepth, isJunction, waysInView, type View } from '../app/src/build.ts';
import { loadModel, outcome } from '../app/src/data.ts';
import { toMermaid, toSvg } from '../app/src/export.ts';
import type { Placed } from '../app/src/shapes.ts';

const EXAMPLE = readFileSync(new URL('../examples/model.yml', import.meta.url), 'utf8');
const CSS = readFileSync(new URL('../app/src/app.css', import.meta.url), 'utf8');
const DEFINED = new Set([...CSS.matchAll(/--([\w-]+):/g)].map((m) => m[1]));

const model = loadModel(EXAMPLE);
const view = waysInView(model, ['documents'], expandToDepth(model, ['documents'], 3), outcome(model, 'house_fire'));

/** Nodes in a row, with no routes: edges are then drawn straight. */
function placed(v: View): Placed {
  const nodes = new Map(v.nodes.map((n, i) => [n.id, { x: i * 140 - 300, y: (i % 3) * 50, w: 120, h: 28 }]));
  return { nodes, edges: new Map(), routing: 'ORTHOGONAL', ms: 0 };
}

test('the SVG draws every node and edge, inside its bounds, in colours app.css has', () => {
  const asked = new Set<string>();
  const { svg } = toSvg(view, placed(view), 'lockout', false, (name) => (asked.add(name), '#123456'));
  assert.equal(svg.match(/<g transform=/g)?.length, view.nodes.length);
  assert.equal(svg.match(/<path d="[^"]*" fill="none"/g)?.length, view.edges.length);
  for (const n of view.nodes) assert.ok(svg.includes(`>${n.label}</text>`), n.label);
  assert.deepEqual(
    [...asked].filter((name) => !DEFINED.has(name)),
    [],
  );
  assert.ok(!/style=|var\(/.test(svg), 'no stylesheet or variables: it stands alone');

  const [x, y, w, h] = /viewBox="([^"]+)"/.exec(svg)![1].split(' ').map(Number);
  for (const b of placed(view).nodes.values()) {
    assert.ok(b.x >= x && b.y >= y && b.x + b.w <= x + w && b.y + b.h <= y + h);
  }
});

test('labels are escaped in the SVG', () => {
  const m = loadModel("things:\n  'a<&b': {kind: device}\n");
  const v = waysInView(m, ['a<&b'], new Set());
  const { svg } = toSvg(v, placed(v), '', false, () => '#000');
  assert.ok(svg.includes('a&#60;&#38;b') && !svg.includes('a<&b'));
});

test('the Mermaid has every node and edge, with valid ids and the scenario colours', () => {
  const text = toMermaid(view, false, 'lockout');
  const lines = text.split('\n');
  const ids = new Map(view.nodes.map((n, i) => [n.id, isJunction(n.kind) ? `j${i}` : n.id]));
  for (const id of ids.values())
    assert.ok(
      lines.some(
        (l) =>
          l.startsWith(`  ${id}(`) || l.startsWith(`  ${id}[`) || l.startsWith(`  ${id}{`) || l.startsWith(`  ${id}>`),
      ),
      id,
    );
  for (const e of view.edges) {
    assert.ok(
      lines.some((l) => new RegExp(`^  ${ids.get(e.source)} \\S+ ${ids.get(e.target)}$`).test(l)),
      e.id,
    );
  }
  for (const n of view.nodes) {
    if (n.status && n.status in CLASSES.lockout) {
      assert.ok(
        lines.some((l) => l.startsWith('  class ') && l.split(' ')[3].split(',').includes(n.id)),
        n.id,
      );
    }
  }
});
