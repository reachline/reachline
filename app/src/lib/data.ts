// The UI's model: the engine, run in the page on a model's text as the server
// stores it.
import { BASELINE, Model, ReachError, type Scenario } from '../../../engine/model.ts';
import { compare } from '../../../engine/report.ts';

export { Model, ReachError };

/** A model that starts empty. */
export const EMPTY = 'version: 1\nme: []\nthings: {}\n';

/** The model's text with the named plans (from its `plans:`) applied in order. */
export function loadModel(text: string, plans: string[] = []): Model {
  return new Model({ path: 'model.yml', text }, plans);
}

/** The model with the named plans, or why it doesn't load. */
export function tryLoad(text: string, plans: string[] = []): Model | ReachError {
  try {
    return loadModel(text, plans);
  } catch (e) {
    if (e instanceof ReachError) return e;
    throw e;
  }
}

/** How verdicts compare between two texts, each with its plans; null if either doesn't load. */
export function compareTexts(before: string, after: string, beforePlans: string[], afterPlans: string[]) {
  const [b, a] = [tryLoad(before, beforePlans), tryLoad(after, afterPlans)];
  if (b instanceof ReachError || a instanceof ReachError) return null;
  return compare(b, a, [...new Set([...a.scenarios.keys(), ...b.scenarios.keys()])]);
}

/** A scenario in a line: what it takes away, or what the attacker starts with. */
export function summary(name: string, sc: Scenario): string {
  if (name === BASELINE) return 'the normal day: you, with nothing lost';
  const ids = ((sc.kind === 'lockout' ? sc.lost : sc.attacker) ?? []).join(', ') || 'nothing';
  return sc.kind === 'lockout' ? `loses ${ids}` : `the attacker has ${ids}`;
}
