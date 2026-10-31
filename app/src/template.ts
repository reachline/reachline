// Templates: a fragment of a model for a common service, with slots for the
// things you probably have already and options for what you've set up. Read
// from templates/; turned into things to add with your choices.
import { parse } from 'yaml';
import { prune, REFS, swap, validId } from './edit.ts';

type Fields = Record<string, unknown>;

export interface Template {
  /** The file's name, without .yml. */
  id: string;
  name: string;
  note: string;
  /** When its facts were last checked against the service's own docs. */
  checked: string;
  /** Where its facts come from: title and URL. */
  links: { title: string; url: string }[];
  /** Ids that start with it (and it alone) take the prefix you choose. */
  prefix: string;
  /** Things you likely have: bound to one of yours, or else created. */
  slots: { id: string; label: string; kind: string }[];
  /** Things you may not have set up, labelled by their note, and whether they start ticked. */
  optional: { id: string; label: string; on: boolean }[];
  things: Record<string, Fields>;
}

const obj = (v: unknown): Fields => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Fields) : {});
const str = (v: unknown) => (typeof v === 'string' ? v : v instanceof Date ? v.toISOString().slice(0, 10) : '');

/** A template from its file. Throws if it's malformed. */
export function readTemplate(id: string, text: string): Template {
  const doc = obj(parse(text));
  const head = obj(doc.template);
  const things = obj(doc.things) as Record<string, Fields>;
  const bad = (why: string) => new Error(`templates/${id}.yml: ${why}`);
  const prefix = str(head.prefix);
  if (!str(head.name)) throw bad('template.name is missing');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str(head.checked))) throw bad('template.checked must be a date (YYYY-MM-DD)');
  if (!validId(prefix)) throw bad('template.prefix must be an id');
  if (!Object.values(obj(head.links)).every((u) => str(u).startsWith('https://')))
    throw bad('template.links must map titles to https URLs');
  const known = (what: string) => (k: string) => {
    if (!(k in things)) throw bad(`${what} ${k} isn't one of its things`);
  };
  Object.keys(obj(head.slots)).forEach(known('slot'));
  Object.keys(obj(head.optional)).forEach(known('optional'));
  return {
    id,
    name: str(head.name),
    note: str(head.note),
    checked: str(head.checked),
    links: Object.entries(obj(head.links)).map(([title, url]) => ({ title, url: str(url) })),
    prefix,
    slots: Object.entries(obj(head.slots)).map(([k, label]) => ({
      id: k,
      label: str(label),
      kind: str(things[k].kind),
    })),
    optional: Object.entries(obj(head.optional)).map(([k, on]) => ({
      id: k,
      label: str(things[k].note),
      on: on === true,
    })),
    things,
  };
}

export interface Choices {
  prefix: string;
  /** Each slot's thing in the model, or null to create the template's. */
  slots: Record<string, string | null>;
  /** The optional things to keep. */
  include: Set<string>;
}

/** Every id a value refers to: a list's items, a mapping's values (mirrors). */
const ids = (v: unknown): string[] =>
  typeof v === 'string'
    ? [v]
    : Array.isArray(v)
      ? v.flatMap(ids)
      : v && typeof v === 'object'
        ? Object.values(v).flatMap(ids)
        : [];
const refsIn = (spec: Fields) => REFS.things.flatMap((f) => ids(spec[f]));

/**
 * The things a template adds, with your choices. An optional thing left out
 * is removed as one never set up: an any-of it empties is a step the service
 * doesn't ask for. A slot nothing needs any more isn't created.
 */
export function instantiate(t: Template, c: Choices): Record<string, Fields> {
  let things: Record<string, Fields> = structuredClone(t.things);
  const map = (f: (id: string, spec: Fields) => Fields) =>
    (things = Object.fromEntries(Object.entries(things).map(([id, spec]) => [id, f(id, spec)])));
  const drop = (id: string) => (things = Object.fromEntries(Object.entries(things).filter(([k]) => k !== id)));

  const out = t.optional.filter((o) => !c.include.has(o.id)).map((o) => o.id);
  for (const id of out) drop(id);
  map((_, spec) =>
    Object.fromEntries(
      Object.entries(spec).flatMap(([f, v]) => {
        if (!REFS.things.includes(f)) return [[f, v]];
        const pruned = prune(f, v, out, true);
        return pruned === null || (Array.isArray(pruned) && !pruned.length) ? [] : [[f, pruned]];
      }),
    ),
  );
  const slots = new Set(t.slots.map((s) => s.id));
  const used = new Set(Object.entries(things).flatMap(([id, spec]) => (slots.has(id) ? [] : refsIn(spec))));
  for (const s of slots) if (!used.has(s)) drop(s);
  for (const [slot, mine] of Object.entries(c.slots)) {
    if (mine === null || !(slot in things)) continue;
    drop(slot);
    map((_, spec) => swap(spec, slot, mine) as Fields);
  }
  const renamed = (id: string) =>
    id === t.prefix || id.startsWith(`${t.prefix}_`) ? c.prefix + id.slice(t.prefix.length) : id;
  for (const id of Object.keys(things)) {
    if (renamed(id) !== id) map((_, spec) => swap(spec, id, renamed(id)) as Fields);
  }
  return Object.fromEntries(Object.entries(things).map(([id, spec]) => [renamed(id), spec]));
}
