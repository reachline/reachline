// Checking a model's text as it's edited: the model it gives, if any, and its
// problems as ranges of the text for the editor to mark.
import { isMap, isNode, isScalar, isSeq, parseDocument, Parser, type Document } from 'yaml';
import { load, ReachError, type Model, type Path } from '../../engine/model.ts';
import { loadModel } from './data.ts';

export interface Problem {
  from: number;
  to: number;
  message: string;
  severity: 'error' | 'warning';
}

/**
 * The model with the plans in use applied, or null if it doesn't load. Every
 * other plan is checked on its own too, since loading only checks the plans it
 * applies.
 */
export function check(text: string, plans: string[]): { model: Model | null; problems: Problem[] } {
  const doc = parseDocument(text);
  if (doc.errors.length) {
    return {
      model: null,
      problems: doc.errors.map((e) => ({ from: e.pos[0], to: e.pos[1], message: e.message, severity: 'error' })),
    };
  }
  const problems = new Map<string, Problem>();
  const add = (e: unknown) => {
    if (!(e instanceof ReachError)) throw e;
    for (const { path, message } of e.at.length ? e.at : [{ path: [], message: e.message }]) {
      const [from, to] = rangeOf(doc, text, path);
      problems.set(`${from}:${to}:${message}`, { from, to, message, severity: 'error' });
    }
  };
  let model: Model | null = null;
  try {
    model = loadModel(text, plans);
  } catch (e) {
    add(e);
  }
  for (const name of planNames(doc)) {
    if (plans.includes(name)) continue;
    try {
      load({ path: 'model.yml', text }, [name]);
    } catch (e) {
      add(e);
    }
  }
  return { model, problems: [...problems.values(), ...comments(text)] };
}

const COMMENT =
  'Comments are removed when the model is edited through its forms or formatted; keep notes in note or todo.';

/** A warning on each comment, found in the concrete syntax tree, which keeps where they are. */
function comments(text: string): Problem[] {
  const out: Problem[] = [];
  const walk = (n: unknown) => {
    if (Array.isArray(n)) n.forEach(walk);
    else if (n && typeof n === 'object') {
      const t = n as { type?: string; offset?: number; source?: string };
      if (t.type === 'comment' && t.offset !== undefined && t.source !== undefined) {
        out.push({ from: t.offset, to: t.offset + t.source.length, message: COMMENT, severity: 'warning' });
      } else Object.values(n).forEach(walk);
    }
  };
  for (const token of new Parser().parse(text)) walk(token);
  return out;
}

/** Where a thing is defined: under `things:`, or else in a plan in use. Null if neither has it. */
export function definitionOf(text: string, id: string, plans: string[]): [number, number] | null {
  const doc = parseDocument(text);
  const path = [['things', id], ...plans.map((p) => ['plans', p, 'things', id])].find((p) => doc.hasIn(p));
  return path ? rangeOf(doc, text, path) : null;
}

const keyOf = (k: unknown) => String(isScalar(k) ? k.value : k);

function planNames(doc: Document): string[] {
  const plans = doc.get('plans');
  return isMap(plans) ? plans.items.map((p) => keyOf(p.key)) : [];
}

/**
 * The text to mark for a path: a list item, or a mapping's key along with its
 * value if that's a scalar. A path that isn't all there marks the nearest part
 * that is; one that isn't there at all marks the first line.
 */
export function rangeOf(doc: Document, text: string, path: Path): [number, number] {
  for (let n = path.length; n > 0; n--) {
    const parent = n === 1 ? doc.contents : doc.getIn(path.slice(0, n - 1), true);
    const key = path[n - 1];
    if (isSeq(parent)) {
      const item = parent.items[Number(key)];
      if (isNode(item) && item.range) return [item.range[0], item.range[1]];
    } else if (isMap(parent)) {
      const pair = parent.items.find((p) => keyOf(p.key) === String(key));
      if (isNode(pair?.key) && pair.key.range) {
        const { value } = pair;
        const end = isScalar(value) && value.range ? value.range[1] : pair.key.range[1];
        return [pair.key.range[0], Math.max(end, pair.key.range[1])];
      }
    }
  }
  const eol = text.indexOf('\n');
  return [0, eol < 0 ? text.length : eol];
}
