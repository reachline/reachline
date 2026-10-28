// The UI's model, computed in the page by the engine from data/model.yml and
// any plans in data/plans/, or from examples/ when there's no data/ (or with
// ?model=example). Vite reads the YAML from disk (and reloads when it changes);
// nothing leaves 127.0.0.1.
import { availability, Model, ReachError, type Best, type Row, type Scenario } from '../../engine/model.ts';

// import.meta.glob needs its options written out, so no shared constant.
const DIRS = {
  data: {
    model: import.meta.glob<string>('../../data/model.yml', { query: '?raw', import: 'default', eager: true }),
    plans: import.meta.glob<string>('../../data/plans/*.yml', { query: '?raw', import: 'default', eager: true }),
  },
  example: {
    model: import.meta.glob<string>('../../examples/model.yml', { query: '?raw', import: 'default', eager: true }),
    plans: import.meta.glob<string>('../../examples/plans/*.yml', { query: '?raw', import: 'default', eager: true }),
  },
};

/** Which model the page shows: the personal one if it exists. */
export const SOURCE: keyof typeof DIRS =
  new URLSearchParams(import.meta.env.SSR ? '' : location.search).get('model') === 'example' ||
  !Object.keys(DIRS.data.model).length
    ? 'example'
    : 'data';
const { model: modelFiles, plans: planTexts } = DIRS[SOURCE];
const modelText = Object.values(modelFiles)[0];

const planName = (path: string) => path.replace(/^.*\//, '').replace(/\.yml$/, '');
const PLAN_PATHS = new Map(Object.keys(planTexts).map((p) => [planName(p), p]));

/** Plan names (file names without .yml), as `?plan=` takes them. */
export const PLANS = [...PLAN_PATHS.keys()];

export { Model, ReachError };

/** model.yml with the named plans applied in order. */
export function loadModel(plans: string[] = []): Model {
  const sources = [{ path: 'model.yml', text: modelText }];
  for (const name of plans) {
    const path = PLAN_PATHS.get(name);
    if (!path) throw new ReachError(`unknown plan: ${name} (have ${PLANS.join(', ')})`);
    sources.push({ path: `plans/${name}.yml`, text: planTexts[path] });
  }
  return new Model(sources);
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
