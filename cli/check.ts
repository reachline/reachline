// What `check` and `push` say about a model: its errors, and how its verdicts
// differ from the revision it was pulled at. All from the engine; nothing new.
import { parse } from 'yaml';
import { load, Model, ReachError, type Source } from '../engine/model.ts';
import { compare, diff } from '../engine/report.ts';

function planNames(text: string): string[] {
  const doc: unknown = parse(text);
  const plans = typeof doc === 'object' && doc !== null ? (doc as Record<string, unknown>).plans : undefined;
  return typeof plans === 'object' && plans !== null ? Object.keys(plans) : [];
}

/** Every problem: the model's, or once it loads, each plan's on its own (loading checks only the plans it applies). */
export function errors(source: Source): string[] {
  const found = new Set<string>();
  const attempt = (plans: string[]) => {
    try {
      load(source, plans);
    } catch (e) {
      if (!(e instanceof ReachError)) throw e;
      found.add(e.message);
    }
  };
  attempt([]);
  if (!found.size) for (const plan of planNames(source.text)) attempt([plan]);
  return [...found];
}

/** The scenarios whose verdicts differ, as a plan's before/after; null if either side doesn't load. */
export function changes(before: Source, after: Source): string[] | null {
  let b, a;
  try {
    b = new Model(before);
    a = new Model(after);
  } catch (e) {
    if (e instanceof ReachError) return null;
    throw e;
  }
  const names = compare(b, a, [...a.scenarios.keys()])
    .filter((c) => c.changed.length)
    .map((c) => c.name);
  return diff(b, a, names);
}
