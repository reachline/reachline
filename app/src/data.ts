// The UI's model: the engine, run in the page on a model's text as the server
// stores it.
import { availability, Model, ReachError, type Best, type Row, type Scenario } from '../../engine/model.ts';

export { Model, ReachError };

/** The smallest model the engine accepts, for a model that starts empty. */
export const EMPTY = 'version: 1\nme: []\nthings: {}\n\nscenarios:\n  baseline: {kind: lockout}\n';

/** The model's text with the named plans (from its `plans:`) applied in order. */
export function loadModel(text: string, plans: string[] = []): Model {
  return new Model({ path: 'model.yml', text }, plans);
}

/** One scenario's results, as the views colour them. */
export interface Outcome {
  sc: Scenario;
  start: string[];
  best: Best;
  avail: Map<string, boolean>;
  rows: Map<string, Row>;
}

export function outcome(m: Model, name: string): Outcome {
  const { sc, best } = m.run(name);
  return { sc, start: m.start(sc), best, avail: availability(m.things, new Set(sc.lost)), rows: m.rows(name) };
}
