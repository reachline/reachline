// How the graph's nodes read: a status's glyph and words, a node's name for
// screen readers, and the edges that go with a node when it's selected.
import { isJunction, type EdgeKind, type View, type VNode } from '../../../engine/view.ts';

/** A node's ways in, or what it's a way into. */
export type Side = 'in' | 'out';

/** What the graph shows: one thing's ways in, where things live, or everything. */
export type Mode = 'ways' | 'where' | 'all';

/**
 * A node's status in words, and the glyph that shows it beside the name so
 * it isn't told by colour alone. The glyph follows the colour: ✓ where the
 * fill is good, ✗ where it's bad, ? where it rests on assumptions.
 */
export function verdict(n: VNode, scenarioKind: string): { mark?: string; words: string } | undefined {
  const breach = scenarioKind === 'breach';
  switch (n.status) {
    case 'has':
      return breach ? { mark: '✗', words: 'reached by the attacker' } : { mark: '✓', words: 'reached' };
    case 'maybe':
      return {
        mark: '?',
        words: breach ? 'reached by the attacker if assumptions hold' : 'reached if assumptions hold',
      };
    case 'lost':
      return { mark: '✗', words: 'lost' };
    case 'gone':
      return { words: 'gone in this scenario' };
    case 'start':
      return { words: 'where the attacker starts' };
    case 'none':
      return { words: 'not reached' };
    default:
      return undefined;
  }
}

const JUNCTIONS = { and: 'all of these (and)', or: 'any one of these (or)', unknown: 'something not known (unknown)' };

/** A node's name for screen readers: what it is, and what the scenario says about it. */
export function describe(n: VNode, scenarioKind: string): string {
  if (n.kind === 'and' || n.kind === 'or' || n.kind === 'unknown') return JUNCTIONS[n.kind];
  const parts = [n.label, n.kind];
  if (n.flag) parts.push(`checked for ${scenarioKind}s`);
  const v = verdict(n, scenarioKind);
  if (v) parts.push(v.words);
  if (n.row) parts.push(`flagged: ${n.row.toLowerCase()}`);
  if (n.more) parts.push('has more ways in');
  if (n.moreOut) parts.push('is a way into more');
  return parts.join(', ');
}

/** The ids of a node's edges, followed through junctions so each condition it's part of is whole. */
export function edgesOf(view: View, id: string): Set<string> {
  const ids = new Set<string>();
  const junctions = new Set(view.nodes.filter((n) => isJunction(n.kind)).map((n) => n.id));
  const walk = (from: string, down: boolean) => {
    for (const e of view.edges) {
      if ((down ? e.source : e.target) !== from || ids.has(e.id)) continue;
      ids.add(e.id);
      const next = down ? e.target : e.source;
      if (junctions.has(next)) walk(next, down);
    }
  };
  walk(id, true);
  walk(id, false);
  return ids;
}

/**
 * The kind each edge is drawn as, by its id. A part of an AND/OR is drawn as
 * the edge its junction leads into (through any junctions between), so a
 * condition's parts look like the way in they make up, and grey is left to
 * dead edges alone. Each junction has the one edge out.
 */
export function drawnAs(view: View): Map<string, Exclude<EdgeKind, 'part'>> {
  const junctions = new Set(view.nodes.filter((n) => isJunction(n.kind)).map((n) => n.id));
  const out = new Map(view.edges.filter((e) => junctions.has(e.source)).map((e) => [e.source, e]));
  const lead = (j: string): Exclude<EdgeKind, 'part'> => {
    const e = out.get(j)!;
    return e.kind === 'part' ? lead(e.target) : e.kind;
  };
  return new Map(view.edges.map((e) => [e.id, e.kind === 'part' ? lead(e.target) : e.kind]));
}
