// The canonical text of a model, which guided edits and Format write: the same
// data, always laid out the same way, without comments or block scalars.
import { isAlias, isMap, isScalar, isSeq, parse, parseDocument, type Document } from 'yaml';
import { CondError, fmtCond, parseCond } from '../../engine/cond.ts';
import { CONDITIONS } from '../../engine/model.ts';

/** Things and scenarios go on one line when they fit in this many columns. */
const WIDTH = 100;
const INDENT = '  ';

/** Mappings laid out as blocks, one entry per line, where they hold anything. */
const CONTAINERS = new Set(['things', 'scenarios', 'plans']);

/** The text in canonical form. Throws on a YAML syntax error. */
export function format(text: string): string {
  const doc = parseDocument(text);
  if (doc.errors.length) throw doc.errors[0];
  return emit(doc);
}

/** A document's canonical text. */
export function emit(doc: Document): string {
  if (doc.contents === null) return '';
  tidyConditions(doc);
  const value = resolve(doc, doc.contents);
  return (isMap(value) ? layer(doc, value, 0).join('\n') : flow(doc, value)) + '\n';
}

/**
 * The model, or a plan: a block of fields and containers. In the model, a
 * blank line goes around anything that spans lines, between plans, and before
 * things of a new kind; in a plan, blank lines would blur where it ends.
 */
function layer(doc: Document, map: object, depth: number): string[] {
  const gaps = depth === 0;
  const chunks: string[][] = pairs(doc, map).map(([key, value]) => {
    const head = `${INDENT.repeat(depth)}${scalar(key, 'key')}:`;
    if (!CONTAINERS.has(key) || !isMap(value) || !value.items.length) return [`${head} ${flow(doc, value, 'block')}`];
    const entries = pairs(doc, value);
    if (key === 'plans') {
      return [
        head,
        ...entries.flatMap(([name, plan], i) => {
          const lines =
            isMap(plan) && plan.items.length
              ? [`${INDENT.repeat(depth + 1)}${scalar(name, 'key')}:`, ...layer(doc, plan, depth + 2)]
              : [entry(doc, name, plan, depth + 1)];
          return i ? ['', ...lines] : lines;
        }),
      ];
    }
    let kind: unknown;
    return [
      head,
      ...entries.flatMap(([id, spec]) => {
        const k = gaps && key === 'things' && isMap(spec) ? resolve(doc, spec.get('kind', true)) : undefined;
        const gap = isScalar(k) && kind !== undefined && k.value !== kind;
        if (isScalar(k)) kind = k.value;
        return [...(gap ? [''] : []), ...entry(doc, id, spec, depth + 1).split('\n')];
      }),
    ];
  });
  return chunks.flatMap((c, i) => (gaps && i && (c.length > 1 || chunks[i - 1].length > 1) ? ['', ...c] : c));
}

/** A thing or scenario: one line if it fits, or else a field per line. */
function entry(doc: Document, key: string, value: unknown, depth: number): string {
  const pad = INDENT.repeat(depth);
  const head = `${pad}${scalar(key, 'key')}:`;
  const one = `${head} ${flow(doc, value, 'block')}`;
  if (!isMap(value) || !value.items.length || one.length <= WIDTH) return one;
  const inner = pad + INDENT;
  const lines = [head];
  for (const [field, v] of pairs(doc, value)) {
    lines.push(`${inner}${scalar(field, 'key')}: ${flow(doc, v, 'block')}`);
  }
  return lines.join('\n');
}

/** A value on one line. A string at the end of a block line may hold what a flow collection can't. */
function flow(doc: Document, node: unknown, ctx: 'block' | 'flow' = 'flow'): string {
  const n = resolve(doc, node);
  if (isMap(n))
    return `{${pairs(doc, n)
      .map(([k, v]) => `${scalar(k, 'flowkey')}: ${flow(doc, v)}`)
      .join(', ')}}`;
  if (isSeq(n)) return `[${n.items.map((i) => flow(doc, i)).join(', ')}]`;
  return scalar(isScalar(n) ? n.value : n, ctx);
}

/** A mapping's entries, keys as strings, as the engine reads them. */
function pairs(doc: Document, map: unknown): [string, unknown][] {
  if (!isMap(map)) return [];
  return map.items.map((p) => {
    const k = resolve(doc, p.key);
    return [String(isScalar(k) ? k.value : k), p.value];
  });
}

/** Each condition, in the model and its plans, spaced and bracketed one way; one that doesn't parse is left as it is. */
function tidyConditions(doc: Document) {
  const plans = doc.get('plans', true);
  const layers = [doc.contents, ...(isMap(plans) ? plans.items.map((p) => p.value) : [])];
  for (const layer of layers) {
    const things = isMap(layer) ? layer.get('things', true) : null;
    if (!isMap(things)) continue;
    for (const { value: spec } of things.items) {
      if (!isMap(spec)) continue;
      for (const field of CONDITIONS) {
        const v = spec.get(field, true);
        if (!isScalar(v) || typeof v.value !== 'string') continue;
        try {
          v.value = fmtCond(parseCond(v.value));
        } catch (e) {
          if (!(e instanceof CondError)) throw e;
        }
      }
    }
  }
}

const resolve = (doc: Document, n: unknown): unknown => (isAlias(n) ? n.resolve(doc) : n);

/** Where a scalar goes: a block mapping's key, the value ending a block line, or inside a flow collection. */
type Context = 'key' | 'block' | 'flow' | 'flowkey';
const PROBES: Record<Context, (s: string) => [string, (got: unknown) => unknown]> = {
  key: (s) => [`${s}: 0`, (got) => Object.keys(got as object).join()],
  block: (s) => [`k: ${s}`, (got) => (got as { k?: unknown }).k],
  flow: (s) => [`[${s}]`, (got) => (Array.isArray(got) && got.length === 1 ? (got as unknown[])[0] : undefined)],
  flowkey: (s) => [`{${s}: 0}`, (got) => Object.keys(got as object).join()],
};

const cache = new Map<string, boolean>();

/** A scalar as written: plain where YAML reads it back unchanged, double-quoted otherwise. */
function scalar(v: unknown, ctx: Context): string {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (typeof v !== 'string') return JSON.stringify(v);
  const key = `${ctx}:${v}`;
  let ok = cache.get(key);
  if (ok === undefined) cache.set(key, (ok = plain(v, ctx)));
  // JSON's strings are YAML's double-quoted scalars.
  return ok ? v : JSON.stringify(v);
}

/** Whether YAML reads the string back as itself, unquoted, where it's going. */
function plain(s: string, ctx: Context): boolean {
  if (s === '' || s.trim() !== s || /[\n\r\t]/.test(s)) return false;
  const [probe, read] = PROBES[ctx](s);
  try {
    const got: unknown = parse(probe, { logLevel: 'silent' });
    return typeof got === 'object' && got !== null && read(got) === s;
  } catch {
    return false;
  }
}
