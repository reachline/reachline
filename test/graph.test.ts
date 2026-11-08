// The graph's views: what expanding shows in each direction, and what selecting lights.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isJunction, waysInView, type View } from '../engine/view.ts';
import { edgesOf } from '../app/src/graph/nodes.ts';
import { loadModel } from '../app/src/lib/data.ts';

const model = loadModel(`version: 1
things:
  home: {kind: location}
  phone: {kind: device, in: home}
  pin: {kind: secret, in: home}
  mail: {kind: account, access: phone and pin}
  bank: {kind: account, recovery: mail}
  photos: {kind: data, in: phone}
`);

const node = (v: View, id: string) => v.nodes.find((n) => n.id === id);
const things = (v: View) => v.nodes.filter((n) => !isJunction(n.kind)).map((n) => n.id);

test('showing what a thing leads to draws each condition it is part of whole, and hiding it undoes that', () => {
  const before = waysInView(model, ['pin'], new Set());
  assert.equal(node(before, 'pin')!.moreOut, true);

  const shown = waysInView(model, ['pin'], new Set(), undefined, new Set(['pin']));
  // mail needs phone as well as pin, so phone comes too, with its own ways in still to show.
  assert.deepEqual(things(shown).sort(), ['mail', 'phone', 'pin']);
  assert.equal(shown.edges.filter((e) => e.kind === 'part').length, 2);
  assert.equal(node(shown, 'pin')!.expandedOut, true);
  assert.equal(node(shown, 'pin')!.moreOut, false);
  assert.equal(node(shown, 'phone')!.more, true);
  // mail's only way in is drawn, but it leads on to bank, which isn't.
  assert.equal(node(shown, 'mail')!.more, false);
  assert.equal(node(shown, 'mail')!.moreOut, true);

  assert.deepEqual(waysInView(model, ['pin'], new Set(), undefined, new Set()), before);
});

test('a node leads to more only while something it is a way into is missing', () => {
  const v = waysInView(model, ['bank'], new Set(['bank', 'mail']));
  assert.equal(node(v, 'mail')!.moreOut, false); // bank, its only use, is shown
  assert.equal(node(v, 'phone')!.moreOut, true); // photos isn't
  assert.equal(node(v, 'phone')!.more, true);
  assert.equal(node(v, 'mail')!.expanded, true);
});

test("a node's lit edges follow through junctions, and stop at things", () => {
  const v = waysInView(model, ['bank'], new Set(['bank', 'mail']));
  const touched = (id: string) =>
    new Set([...edgesOf(v, id)].flatMap((eid) => ends(v, eid)).filter((x) => !isJunction(node(v, x)!.kind)));

  // phone reaches mail through the junction; pin's edge into the junction isn't phone's.
  assert.equal(edgesOf(v, 'phone').size, 2);
  assert.deepEqual(touched('phone'), new Set(['phone', 'mail']));
  // mail lights its whole condition, and its own edge on to bank.
  assert.deepEqual(touched('mail'), new Set(['phone', 'pin', 'mail', 'bank']));
});

const ends = (v: View, eid: string) => {
  const e = v.edges.find((e) => e.id === eid)!;
  return [e.source, e.target];
};
