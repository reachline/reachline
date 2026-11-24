// ELK, loaded for where it runs; the layout itself is in place.ts.
import ElkApi, { type ELK } from 'elkjs/lib/elk-api.js';
import workerUrl from 'elkjs/lib/elk-worker.min.js?url';
import type { View } from '../../../engine/view.ts';
import { elkLayout, type LayoutOpts, type Placed } from './place.ts';

// In the page, ELK runs in a web worker so a big layout doesn't freeze the UI.
// bench.ts loads this through Vite's SSR in Node, where there are no web
// workers, so there it runs inline (and the page's build leaves that out).
let elk: Promise<ELK> | undefined;
const getElk = () =>
  (elk ??= import.meta.env.SSR
    ? import('elkjs/lib/elk.bundled.js').then((m) => new m.default())
    : Promise.resolve(new ElkApi({ workerUrl })));

export const layout = async (view: View, opts: LayoutOpts): Promise<Placed> => elkLayout(await getElk(), view, opts);
