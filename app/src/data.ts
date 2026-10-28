// The UI's model, computed in the page by the engine from data/model.yml, or
// from examples/model.yml when there's no data/ (or with ?model=example). Vite
// reads the YAML from disk (and reloads when it changes); nothing leaves
// 127.0.0.1.
import { availability, Model, ReachError, type Best, type Row, type Scenario } from '../../engine/model.ts';

// import.meta.glob needs its options written out, so no shared constant.
const FILES = {
  data: import.meta.glob<string>('../../data/model.yml', { query: '?raw', import: 'default', eager: true }),
  example: import.meta.glob<string>('../../examples/model.yml', { query: '?raw', import: 'default', eager: true }),
};

/** Which model the page shows: the personal one if it exists. */
export const SOURCE: keyof typeof FILES =
  new URLSearchParams(import.meta.env.SSR ? '' : location.search).get('model') === 'example' ||
  !Object.keys(FILES.data).length
    ? 'example'
    : 'data';
const modelText = Object.values(FILES[SOURCE])[0];

export { Model, ReachError };

/** model.yml with the named plans (from its `plans:`) applied in order. */
export function loadModel(plans: string[] = []): Model {
  return new Model({ path: 'model.yml', text: modelText }, plans);
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
