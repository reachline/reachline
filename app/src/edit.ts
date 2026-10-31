// Guided edits. Each changes the parsed document, which is then written back
// whole in the canonical format (format.ts), so the text stays the one source
// of truth. An edit goes to the base model or to one plan; a rename is always
// everywhere, since a plan can't express one.
import { isMap, isScalar, parse, parseDocument, type Document, type YAMLMap } from 'yaml';
import { fmtSet, leaves, type AndSet, type Expr, type Kind } from '../../engine/model.ts';
import { emit } from './format.ts';

/** Where an edit goes: the base model (null), or a plan by name. */
export type Layer = string | null;
export type Edit = (doc: Document) => void;
type Path = (string | number)[];

/** The text after the edits, in canonical form. Throws on a YAML syntax error. */
export function edit(text: string, ...edits: Edit[]): string {
  const doc = parseDocument(text);
  if (doc.errors.length) throw doc.errors[0];
  for (const e of edits) e(doc);
  return emit(doc);
}

/** Ids the forms give things, scenarios and plans: they never need quoting, in YAML 1.1 or 1.2. */
export const ID = /^[a-z][a-z0-9_]*$/;
const RESERVED = new Set(['y', 'n', 'yes', 'no', 'on', 'off', 'true', 'false', 'null']);
export const validId = (id: string) => ID.test(id) && !RESERVED.has(id);

/** Fields that hold ids. */
export const REFS = {
  things: ['in', 'needs', 'access', 'recovery', 'mirrors'],
  scenarios: ['lost', 'attacker', 'assume', 'deny'],
};

const at = (layer: Layer, ...path: Path): Path => (layer === null ? path : ['plans', layer, ...path]);
const keyOf = (k: unknown) => String(isScalar(k) ? k.value : k);
const js = (doc: Document, path: Path): unknown => {
  const n = doc.getIn(path, true);
  return n && typeof n === 'object' && 'toJSON' in n ? (n as { toJSON(): unknown }).toJSON() : n;
};
/** Values go in as nodes: the format reads nodes, not plain values. */
const put = (doc: Document, path: Path, v: unknown) => doc.setIn(path, doc.createNode(v));
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const empty = (v: unknown) => v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length);

export function planNames(doc: Document): string[] {
  const plans = doc.get('plans');
  return isMap(plans) ? plans.items.map((p) => keyOf(p.key)) : [];
}

/** The ids of a mapping in the document, in order; none if it isn't there. */
const keys = (doc: Document, path: Path): string[] => {
  const m = doc.getIn(path, true);
  return isMap(m) ? m.items.map((p) => keyOf(p.key)) : [];
};

/** The mapping at path, made if it's missing (or isn't a mapping). */
function mapAt(doc: Document, path: Path): YAMLMap {
  if (!isMap(doc.getIn(path, true))) put(doc, path, {});
  return doc.getIn(path, true) as YAMLMap;
}

/**
 * Sets a field. In the model an empty value removes the field, which means
 * the same; in a plan it's written, since there it replaces the model's.
 * A plan's field that comes back to the model's is dropped from the plan.
 */
function set(doc: Document, layer: Layer, section: 'things' | 'scenarios', id: string, field: string, value: unknown) {
  const path = at(layer, section, id, field);
  if (layer === null) {
    if (empty(value)) doc.deleteIn(path);
    else put(doc, path, value);
    return;
  }
  const base = [section, id];
  if (doc.hasIn(base) && same(js(doc, [...base, field]) ?? null, empty(value) ? null : value)) {
    if (doc.hasIn(path)) doc.deleteIn(path);
    const left = doc.getIn(at(layer, section, id), true);
    if (isMap(left) && !left.items.length) doc.deleteIn(at(layer, section, id));
  } else put(doc, path, value === undefined || value === '' ? null : value);
}

export const setField =
  (layer: Layer, id: string, field: string, value: unknown): Edit =>
  (doc) =>
    set(doc, layer, 'things', id, field, value);

export const setScenarioField =
  (layer: Layer, name: string, field: string, value: unknown): Edit =>
  (doc) =>
    set(doc, layer, 'scenarios', name, field, value);

export const setMe =
  (layer: Layer, me: string[]): Edit =>
  (doc) =>
    put(doc, at(layer, 'me'), me);

/** Adds a thing. In the model it goes after the last thing of its kind. */
export const addThing =
  (layer: Layer, id: string, spec: Record<string, unknown>): Edit =>
  (doc) => {
    const things = mapAt(doc, at(layer, 'things'));
    if (keys(doc, at(layer, 'things')).includes(id)) throw new Error(`${id} is already a thing`);
    const pair = doc.createPair(id, spec);
    const kinds = things.items.map((p) =>
      isMap(p.value) ? js(doc, [...at(layer, 'things'), keyOf(p.key), 'kind']) : null,
    );
    const i = layer === null ? kinds.lastIndexOf(spec.kind) : -1;
    if (i < 0) things.items.push(pair);
    else things.items.splice(i + 1, 0, pair);
  };

export const addScenario =
  (layer: Layer, name: string, spec: Record<string, unknown>): Edit =>
  (doc) => {
    if (keys(doc, at(layer, 'scenarios')).includes(name)) throw new Error(`${name} is already a scenario`);
    mapAt(doc, at(layer, 'scenarios')).items.push(doc.createPair(name, spec));
  };

/**
 * A field's value without an id, never widening access: the id leaves lists
 * and any-of options, and a way in that names it outright goes. A way in whose
 * any-of it empties goes too, unless `optional`: then the id was a method you
 * never set up, so the service doesn't ask for that step.
 */
export function prune(field: string, value: unknown, id: string | string[], optional = false): unknown {
  // Several at once, since an any-of left with one option reads as a plain part.
  const gone = (x: unknown) => (Array.isArray(id) ? id.includes(x as string) : x === id);
  if (field === 'mirrors') {
    const m = value as { of?: unknown; by?: unknown } | null;
    return m && (gone(m.of) || gone(m.by)) ? null : value;
  }
  if (!Array.isArray(value)) return value;
  if (field !== 'access' && field !== 'recovery') return value.filter((x) => !gone(x));
  return value.flatMap((s: unknown) => {
    if (!Array.isArray(s)) return [s];
    const out: Expr[] = [];
    for (const e of s as Expr[]) {
      if (!Array.isArray(e)) {
        if (gone(e)) return [];
        out.push(e);
        continue;
      }
      const options = e.filter((o) => !leaves(o).some(gone));
      if (options.length === 1 && !Array.isArray(options[0])) out.push(options[0]);
      else if (options.length) out.push(options);
      else if (!optional) return [];
    }
    // An AND-set emptied by leaving things out would need nothing at all.
    return out.length || !s.length ? [out] : [];
  });
}

/**
 * Removes a thing. From the model, it goes from every layer, and every
 * reference to it is pruned. From a plan, the plan removes it (or stops adding
 * it), and overrides whatever refers to it, as the model and that plan have it.
 */
export const removeThing =
  (layer: Layer, id: string, optional = false): Edit =>
  (doc) => {
    if (layer === null) {
      for (const l of [null, ...planNames(doc)]) {
        doc.deleteIn(at(l, 'things', id));
        pruneLayer(
          doc,
          l,
          id,
          optional,
          (section, name, field) => js(doc, at(l, section, name, field)),
          (s) => keys(doc, at(l, s)),
        );
      }
      return;
    }
    if (doc.hasIn(['things', id])) put(doc, at(layer, 'things', id), null);
    else doc.deleteIn(at(layer, 'things', id));
    // What the model and this plan give each field, with the plan's own removals left out.
    const named = (s: 'things' | 'scenarios') =>
      [...new Set([...keys(doc, [s]), ...keys(doc, at(layer, s))])].filter(
        (n) => !(doc.hasIn(at(layer, s, n)) && doc.getIn(at(layer, s, n)) === null),
      );
    const effective = (section: string, name: string, field: string) =>
      doc.hasIn(at(layer, section, name, field))
        ? js(doc, at(layer, section, name, field))
        : js(doc, [section, name, field]);
    const me = doc.hasIn(at(layer, 'me')) ? at(layer, 'me') : ['me'];
    pruneLayer(doc, layer, id, optional, effective, named, me);
  };

function pruneLayer(
  doc: Document,
  layer: Layer,
  id: string,
  optional: boolean,
  value: (section: 'things' | 'scenarios', name: string, field: string) => unknown,
  names: (section: 'things' | 'scenarios') => string[],
  me: Path = at(layer, 'me'),
) {
  for (const section of ['things', 'scenarios'] as const) {
    for (const name of names(section)) {
      for (const field of REFS[section]) {
        const v = value(section, name, field);
        if (v === undefined) continue;
        const pruned = prune(field, v, id, optional);
        if (!same(pruned, v)) set(doc, layer, section, name, field, pruned);
      }
    }
  }
  const m = js(doc, me);
  if (Array.isArray(m) && m.includes(id))
    put(
      doc,
      at(layer, 'me'),
      m.filter((x) => x !== id),
    );
}

/** Swaps one id for another wherever a value refers to it. */
export const swap = (v: unknown, from: string, to: string): unknown =>
  v === from
    ? to
    : Array.isArray(v)
      ? v.map((x) => swap(x, from, to))
      : v && typeof v === 'object'
        ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, swap(x, from, to)]))
        : v;

/** Renames a key in place, in each mapping at these paths that has it. */
function renameKey(doc: Document, paths: Path[], from: string, to: string) {
  for (const path of paths) {
    const m = doc.getIn(path, true);
    if (!isMap(m)) continue;
    if (m.items.some((p) => keyOf(p.key) === to)) throw new Error(`${to} is already taken`);
    const pair = m.items.find((p) => keyOf(p.key) === from);
    if (pair) pair.key = doc.createNode(to);
  }
}

/** Renames a thing, and every reference to it, in the model and every plan. */
export const renameThing =
  (from: string, to: string): Edit =>
  (doc) => {
    const ls = [null, ...planNames(doc)];
    renameKey(
      doc,
      ls.map((l) => at(l, 'things')),
      from,
      to,
    );
    for (const l of ls) {
      for (const section of ['things', 'scenarios'] as const) {
        for (const name of keys(doc, at(l, section))) {
          for (const field of REFS[section]) {
            const path = at(l, section, name, field);
            const v = js(doc, path);
            if (v !== undefined && !same(swap(v, from, to), v)) put(doc, path, swap(v, from, to));
          }
        }
      }
      const me = js(doc, at(l, 'me'));
      if (Array.isArray(me) && me.includes(from)) put(doc, at(l, 'me'), swap(me, from, to));
    }
  };

export const renameScenario =
  (from: string, to: string): Edit =>
  (doc) =>
    renameKey(
      doc,
      [null, ...planNames(doc)].map((l) => at(l, 'scenarios')),
      from,
      to,
    );

/** Removes a scenario: from the model, everywhere; from a plan, the plan removes it (or stops adding it). */
export const removeScenario =
  (layer: Layer, name: string): Edit =>
  (doc) => {
    if (layer !== null && doc.hasIn(['scenarios', name])) put(doc, at(layer, 'scenarios', name), null);
    else for (const l of layer === null ? [null, ...planNames(doc)] : [layer]) doc.deleteIn(at(l, 'scenarios', name));
  };

export const addPlan =
  (name: string, note: string): Edit =>
  (doc) => {
    if (planNames(doc).includes(name)) throw new Error(`${name} is already a plan`);
    mapAt(doc, ['plans']).items.push(doc.createPair(name, note ? { note } : {}));
  };

export const renamePlan =
  (from: string, to: string): Edit =>
  (doc) =>
    renameKey(doc, [['plans']], from, to);

export const removePlan =
  (name: string): Edit =>
  (doc) => {
    doc.deleteIn(['plans', name]);
    if (!planNames(doc).length) doc.delete('plans');
  };

/** Merges a plan into the model, as the engine applies it, and removes the plan. */
export const applyPlan =
  (name: string): Edit =>
  (doc) => {
    for (const section of ['things', 'scenarios'] as const) {
      for (const id of keys(doc, ['plans', name, section])) {
        const spec = js(doc, ['plans', name, section, id]);
        if (spec === null) doc.deleteIn([section, id]);
        else if (!doc.hasIn([section, id])) {
          (section === 'things'
            ? addThing(null, id, spec as Record<string, unknown>)
            : addScenario(null, id, spec as Record<string, unknown>))(doc);
        } else {
          for (const [field, v] of Object.entries(spec as object)) set(doc, null, section, id, field, v);
        }
      }
    }
    if (doc.hasIn(['plans', name, 'me'])) put(doc, ['me'], js(doc, ['plans', name, 'me']));
    removePlan(name)(doc);
  };

type Fields = Record<string, unknown>;

/** A thing a form creates on the spot, as it's first referred to. */
export interface Created {
  id: string;
  kind: Kind;
}

/** The layer being edited, and what can be done to it. */
export interface Editing {
  /** Where edits go: the model, or a plan. */
  layer: Layer;
  /** Every plan, in order. */
  plans: string[];
  setLayer: (layer: Layer) => void;
  /** The fields this layer's plan sets on a thing or scenario; none when it's the model. */
  sets: (section: 'things' | 'scenarios', id: string) => string[];
  /** Whether the model has it, rather than only the plan. */
  inModel: (section: 'things' | 'scenarios', id: string) => boolean;
  /** Drops the plan's value for a field, so the model's shows through. */
  revert: (section: 'things' | 'scenarios', id: string, field: string) => void;
  written: Written;
  /** Its things, id to kind. */
  ids: Map<string, string>;
  setThing: (id: string, field: string, value: unknown, created?: Created[]) => void;
  setScenario: (name: string, field: string, value: unknown, created?: Created[]) => void;
  setMe: (me: string[], created: Created[]) => void;
  renameThing: (from: string, to: string) => string;
  renameScenario: (from: string, to: string) => string;
  deleteThing: (id: string) => void;
  deleteScenario: (name: string) => void;
}

/** A layer's things, scenarios and `me` as written, with a plan merged in as the engine merges it. */
export interface Written {
  things: Record<string, Fields>;
  scenarios: Record<string, Fields>;
  me: string[];
}

const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

/**
 * What a form editing this layer shows: the model as written, or the model
 * with this plan over it. Not the engine's view, which normalizes (`in: "?"`
 * becomes a way in).
 */
export function written(text: string, layer: Layer): Written {
  const doc = obj(parse(text));
  const layers = [doc, ...(layer === null ? [] : [obj(obj(doc.plans)[layer])])];
  const out: Written = { things: {}, scenarios: {}, me: [] };
  for (const l of layers) {
    for (const section of ['things', 'scenarios'] as const) {
      for (const [id, spec] of Object.entries(obj(l[section]))) {
        if (spec === null) out[section] = Object.fromEntries(Object.entries(out[section]).filter(([k]) => k !== id));
        else out[section][id] = { ...out[section][id], ...obj(spec) };
      }
    }
    if (Array.isArray(l.me)) out.me = l.me.map(String);
  }
  return out;
}

export interface Change {
  /** A thing or scenario, or `me`. */
  id: string;
  field: string | null;
  before: string;
  after: string;
}

/** How a field reads: access as the CLI writes it, lists comma-separated. */
export function show(field: string, v: unknown): string {
  if (v === undefined || v === null || (Array.isArray(v) && !v.length)) return 'none';
  if ((field === 'access' || field === 'recovery') && Array.isArray(v)) {
    return v.map((s) => (Array.isArray(s) ? fmtSet(s as AndSet) || 'nothing' : String(s))).join(', or ');
  }
  if (field === 'mirrors') return `copy of ${String(obj(v).of)}, synced by ${String(obj(v).by)}`;
  if (Array.isArray(v)) return v.join(', ');
  return typeof v === 'string' ? v : JSON.stringify(v);
}

/** What differs between two versions of a layer, field by field. */
export function changes(before: Written, after: Written): Change[] {
  const out: Change[] = [];
  for (const section of ['things', 'scenarios'] as const) {
    const ids = new Set([...Object.keys(before[section]), ...Object.keys(after[section])]);
    for (const id of ids) {
      const [b, a] = [before[section][id], after[section][id]] as (Fields | undefined)[];
      if (!a || !b) {
        out.push({ id, field: null, before: b ? 'there' : 'none', after: a ? 'added' : 'removed' });
        continue;
      }
      for (const field of new Set([...Object.keys(b), ...Object.keys(a)])) {
        if (!same(b[field], a[field]))
          out.push({ id, field, before: show(field, b[field]), after: show(field, a[field]) });
      }
    }
  }
  if (!same(before.me, after.me))
    out.push({ id: 'me', field: null, before: show('me', before.me), after: show('me', after.me) });
  return out;
}

/**
 * Parts typed as the CLI writes them: `a | b + c` is any one of a, or b and
 * c. Gives the options, each the ids it needs; null if something's missing.
 */
export function parseParts(s: string): string[][] | null {
  const options = s.split('|').map((o) => o.split('+').map((id) => id.trim()));
  return options.every((o) => o.every(Boolean)) ? options : null;
}

/** Options as an element of an AND-set: one id stays an id, several are any-of. */
export const asElement = (options: string[][]): Expr[] =>
  options.length === 1 ? options[0] : [options.map((o) => (o.length === 1 ? o[0] : o))];

/** The model's plans in order, with their notes; none if the text isn't YAML. */
export function plansOf(text: string): { name: string; note: string }[] {
  try {
    return Object.entries(obj(obj(parse(text)).plans)).map(([name, p]) => ({
      name,
      note: typeof obj(p).note === 'string' ? (obj(p).note as string) : '',
    }));
  } catch {
    return [];
  }
}

export const setPlanNote =
  (name: string, note: string): Edit =>
  (doc) => {
    if (note) put(doc, ['plans', name, 'note'], note);
    else doc.deleteIn(['plans', name, 'note']);
  };

/** The fields a plan sets on a thing or scenario: whole things (added or removed) count as every field. */
export function planFields(text: string, plan: string, section: 'things' | 'scenarios', id: string): string[] {
  const spec = obj(obj(obj(obj(obj(parse(text)).plans)[plan])[section])[id]);
  return Object.keys(spec);
}

/** Fields that more than one of these plans sets; the last plan's wins. */
export function overlaps(text: string, plans: string[]): { at: string; plans: string[] }[] {
  const doc = obj(parse(text));
  const by = new Map<string, string[]>();
  for (const plan of plans) {
    const p = obj(obj(doc.plans)[plan]);
    const fields = [
      ...(['things', 'scenarios'] as const).flatMap((s) =>
        Object.entries(obj(p[s])).flatMap(([id, spec]) =>
          spec === null ? [id] : Object.keys(obj(spec)).map((f) => `${id}.${f}`),
        ),
      ),
      ...('me' in p ? ['me'] : []),
    ];
    for (const at of fields) by.set(at, [...(by.get(at) ?? []), plan]);
  }
  return [...by].filter(([, ps]) => ps.length > 1).map(([at, ps]) => ({ at, plans: ps }));
}
