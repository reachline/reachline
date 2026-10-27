// The UI's model, computed in the page by the engine from data/model.yml and
// any plans in data/plans/, or from examples/ when there's no data/ (or with
// ?model=example). Vite reads the YAML from disk (and reloads when it changes);
// nothing leaves 127.0.0.1.
import { availability, Model as Engine, ReachError, type Spec } from '../../engine/model.ts';
import type { Model, Scenario, Thing } from './types';

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
  new URLSearchParams(globalThis.location?.search).get('model') === 'example' || !Object.keys(DIRS.data.model).length
    ? 'example'
    : 'data';
const { model: modelFiles, plans: planTexts } = DIRS[SOURCE];
const modelText = Object.values(modelFiles)[0];

const planName = (path: string) => path.replace(/^.*\//, '').replace(/\.yml$/, '');
const PLAN_PATHS = new Map(Object.keys(planTexts).map((p) => [planName(p), p]));

/** Plan names (file names without .yml), as `?plan=` takes them. */
export const PLANS = [...PLAN_PATHS.keys()];

export { ReachError };

/** model.yml with the named plans applied in order. */
export function loadModel(plans: string[] = []): Model {
  const sources = [{ path: 'model.yml', text: modelText }];
  for (const name of plans) {
    const path = PLAN_PATHS.get(name);
    if (!path) throw new ReachError(`unknown plan: ${name} (have ${PLANS.join(', ')})`);
    sources.push({ path: `plans/${name}.yml`, text: planTexts[path] });
  }
  const m = new Engine(sources);
  const things: Record<string, Thing> = {};
  for (const [tid, s] of m.things) things[tid] = thing(s);
  const scenarios: Record<string, Scenario> = {};
  for (const [name, sc] of m.scenarios) {
    const { best } = m.run(name);
    const avail = availability(m.things, new Set(sc.lost));
    const pick = <K extends 'note' | 'lost' | 'attacker' | 'assume' | 'deny'>(k: K) => (k in sc ? { [k]: sc[k] } : {});
    scenarios[name] = {
      kind: sc.kind as Scenario['kind'],
      ...pick('note'), ...pick('lost'), ...pick('attacker'), ...pick('assume'), ...pick('deny'),
      start: m.start(sc),
      gone: [...avail].filter(([, ok]) => !ok).map(([t]) => t),
      reach: Object.fromEntries([...best].map(([t, { a, why }]) => [t, { assumptions: [...a], why }])),
      rows: Object.fromEntries([...m.rows(name)].map(([t, [status]]) => [t, status])),
    };
  }
  return { things, scenarios, me: m.me, states: [...m.states].sort() };
}

function thing(s: Spec): Thing {
  const t: Thing = { section: s.section, in: s.in, needs: s.needs, access: s.access, recovery: s.recovery, mirrors: s.mirrors };
  for (const k of ['note', 'todo', 'critical', 'sensitive'] as const) if (s[k]) Object.assign(t, { [k]: s[k] });
  return t;
}
