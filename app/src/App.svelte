<script lang="ts">
  import { untrack } from 'svelte';
  import { expandToDepth, isJunction, waysInView, whereView, type View } from './build';
  import FlowView from './FlowView.svelte';
  import { layout, placeLocally, type Direction, type Placed, type Placement, type Routing } from './layout';
  import { fmtWhy, KINDS } from '../../engine/model.ts';
  import { what } from '../../engine/report.ts';
  import type { Conflict } from '../../server/api.ts';
  import { api, ApiFailure, message } from './api';
  import { check, definitionOf } from './check';
  import { download, toMermaid, toPng, toSvg } from './export';
  import { loadModel, outcome, ReachError, type Model } from './data';
  import { beforeLeave, follow } from './route.svelte.ts';
  import { shapePath } from './shapes';

  let { id }: { id: number } = $props();

  type Mode = 'ways' | 'where' | 'all';
  const DEPTH = 2;

  // Initial settings can come from the URL, e.g. ?target=mail&scenario=nas_dies&dir=DOWN
  const q = new URLSearchParams(location.search);
  const plans = (q.get('plan') ?? '').split(',').filter(Boolean);

  let name = $state('');
  let model = $state.raw<Model | null>(null);
  let error = $state('');
  // The text as edited, and as last saved; null until it arrives.
  let text = $state<string | null>(null);
  let saved = $state('');
  let revision = $state(0); // the one saved text is based on
  let saving = $state(false);
  let saveError = $state('');
  // The latest revision, when someone else saved since ours.
  let conflict = $state<number | null>(null);
  let exportOpen = $state(false);
  let exportError = $state('');
  const dirty = $derived(text !== null && text !== saved);
  // What shares the screen with the graph.
  let pane = $state<'text' | 'history' | null>(null);
  // Once opened, the editor stays mounted (hidden when closed) to keep its undo history.
  let editorOpened = $state(false);
  // The latest text doesn't load, so the graph shows the last text that did.
  let invalid = $state(false);
  // Where the thing last selected in the graph is defined, for the editor to show.
  let reveal = $state.raw<{ from: number; to: number } | null>(null);
  let mode = $state<Mode>((q.get('mode') ?? 'ways') as Mode);
  let target = $state(q.get('target') ?? '');
  let scenarioName = $state(q.get('scenario') ?? 'house_fire');
  let routing = $state<Routing>((q.get('routing') ?? 'ORTHOGONAL') as Routing);
  let direction = $state<Direction>((q.get('dir') ?? 'RIGHT') as Direction);
  let placement = $state<Placement>((q.get('place') ?? 'BRANDES_KOEPF') as Placement);
  let expanded = $state.raw<Set<string>>(new Set());
  let selected = $state<string | null>(q.get('select'));

  let shown = $state.raw<{ view: View; placed: Placed } | null>(null);
  let fitKey = $state(0);
  // Set when the view changes wholesale: the next layout starts from scratch and fits.
  let restarting = true;

  api.model(untrack(() => id)).then(
    (doc) => {
      name = doc.name;
      text = saved = doc.text;
      revision = doc.revision;
      open(doc.text);
    },
    (e: unknown) => (error = message(e)),
  );

  $effect(() => {
    if (name) document.title = `${dirty ? '• ' : ''}${name} · ReachLine`;
  });
  $effect(() => beforeLeave(() => !dirty || confirm('Leave without saving your changes?')));

  async function save(base = revision) {
    if (text === null || saving) return;
    const t = text;
    saving = true;
    saveError = '';
    try {
      revision = (await api.save(id, { text: t, base })).revision;
      saved = t;
      conflict = null;
    } catch (e) {
      if (e instanceof ApiFailure && e.status === 409) conflict = (e.body as Conflict).revision;
      else saveError = message(e);
    } finally {
      saving = false;
    }
  }

  /** After a conflict: the latest revision replaces the edits (which undo can bring back). */
  async function loadLatest() {
    try {
      const doc = await api.model(id);
      saved = doc.text;
      revision = doc.revision;
      conflict = null;
      setText(doc.text);
    } catch (e) {
      saveError = message(e);
    }
  }

  /** Saves an old revision's text as a new revision; undo brings back what was there. */
  function restore(t: string) {
    setText(t);
    void save();
  }

  /** Text from outside the editor; in the editor, it's one edit that undo can take back. */
  function setText(t: string) {
    text = t;
    lint(t);
  }

  /** The text, or the graph as it's shown. */
  async function exportAs(format: 'yaml' | 'mermaid' | 'svg' | 'png') {
    exportOpen = false;
    exportError = '';
    try {
      download(`${name}.${EXT[format]}`, await exported(format));
    } catch (e) {
      exportError = (e as Error).message;
    }
  }

  const EXT = { yaml: 'yml', mermaid: 'mmd', svg: 'svg', png: 'png' };

  async function exported(format: 'yaml' | 'mermaid' | 'svg' | 'png'): Promise<Blob> {
    if (format === 'yaml') return new Blob([text ?? ''], { type: 'text/yaml' });
    if (!shown) throw new Error('there is no graph on screen');
    const kind = scenario?.sc.kind ?? '';
    if (format === 'mermaid') return new Blob([toMermaid(shown.view, vertical, kind)], { type: 'text/plain' });
    const css = getComputedStyle(document.documentElement);
    const color = (v: string) => css.getPropertyValue(`--${v}`).trim();
    const { svg, width, height } = toSvg(shown.view, shown.placed, kind, vertical, color);
    return format === 'svg' ? new Blob([svg], { type: 'image/svg+xml' }) : toPng(svg, width, height);
  }

  function onkeydown(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      if (dirty) void save();
    }
  }

  function onbeforeunload(e: BeforeUnloadEvent) {
    if (dirty) e.preventDefault();
  }

  function open(t: string) {
    try {
      show(loadModel(t, plans));
    } catch (e) {
      if (!(e instanceof ReachError)) throw e;
      error = e.message;
      togglePane('text');
    }
  }

  /** Show a model that loaded. The first one picks the starting view; later ones keep it. */
  function show(m: Model) {
    if (!untrack(() => model)) {
      // Without ?target=, start on the first critical thing.
      target ||= [...m.things].find(([, t]) => t.tags.includes('critical'))?.[0] ?? [...m.things.keys()].at(0) ?? '';
      const t = untrack(() => target);
      if (m.things.has(t)) expanded = expandToDepth(m, [t], DEPTH);
    }
    model = m;
    error = '';
  }

  function lint(t: string) {
    const { model: m, problems } = check(t, plans);
    invalid = !m;
    if (m) show(m);
    return problems;
  }

  function togglePane(p: 'text' | 'history') {
    pane = pane === p ? null : p;
    editorOpened ||= pane === 'text';
  }

  const scenario = $derived(model?.scenarios.has(scenarioName) ? outcome(model, scenarioName) : undefined);
  const vertical = $derived(direction === 'DOWN');

  const lost = $derived(mode === 'ways' && !!model && !model.things.has(target));
  const view = $derived.by(() => {
    if (!model) return null;
    if (mode === 'where') return whereView(model, scenario);
    if (mode === 'all') return waysInView(model, [...model.things.keys()], 'all', scenario);
    if (!model.things.has(target)) return null;
    return waysInView(model, [target], expanded, scenario);
  });

  // ?expand=a,b clicks those nodes open one at a time (for headless checks).
  const demo = (q.get('expand') ?? '').split(',').filter(Boolean);
  let demoStarted = false;
  function demoStep() {
    const id = demo.shift();
    if (!id) return;
    onnode(id);
    setTimeout(demoStep, 800);
  }
  $effect(() => {
    if (shown && demo.length && !demoStarted) {
      demoStarted = true;
      setTimeout(demoStep, 800);
    }
  });

  // Expanding adds nodes without moving anything; ELK runs only on a fresh
  // view and on Tidy, and always lays out from scratch.
  let tidyKey = $state(0);
  let elkNext = false; // the next layout runs ELK

  function tidy() {
    elkNext = true;
    tidyKey++;
  }

  let seq = 0;
  $effect(() => {
    const v = view;
    if (!v) return;
    void tidyKey;
    const opts = { direction, routing, placement };
    const prev = restarting ? null : untrack(() => shown?.placed);
    const local = prev && !elkNext;
    elkNext = false;
    const my = ++seq;
    const run = local ? Promise.resolve(placeLocally(v, prev, direction)) : layout(v, opts);
    void run.then((placed) => {
      if (my !== seq) return;
      shown = { view: v, placed };
      if (restarting) {
        restarting = false;
        fitKey++;
      }
    });
  });

  function restart() {
    restarting = true;
  }

  function waysInto(id: string) {
    if (!model) return;
    mode = 'ways';
    target = id;
    expanded = expandToDepth(model, [id], DEPTH);
    restart();
  }

  function onnode(id: string) {
    selected = id;
    const at = text !== null && model?.things.has(id) ? definitionOf(text, id, plans) : null;
    if (at) reveal = { from: at[0], to: at[1] };
    const n = shown?.view.nodes.find((n) => n.id === id);
    if (mode === 'ways' && n?.more) expanded = new Set([...expanded, id]);
  }

  function collapse(id: string) {
    expanded = new Set([...expanded].filter((x) => x !== id));
  }

  const byId = $derived(new Map(shown?.view.nodes.map((n) => [n.id, n]) ?? []));
  const selNode = $derived(selected ? byId.get(selected) : undefined);
  const selThing = $derived(selected ? model?.things.get(selected) : undefined);
  const selReach = $derived(selected ? scenario?.best.get(selected) : undefined);

  const thingsByKind = $derived.by(() => {
    const things = [...(model?.things ?? [])];
    return KINDS.map((k) => [k, things.filter(([, t]) => t.kind === k).map(([id]) => id)] as const);
  });

  const EDGE_KINDS = ['in', 'access', 'recovery', 'needs', 'mirror', 'part'] as const;
</script>

<svelte:window {onkeydown} {onbeforeunload} />

<div class="app" class:editing={pane !== null}>
  <header class="bar">
    <a href="/" onclick={follow}>← Models</a>
    <b>{name}</b>
    <button aria-pressed={pane === 'text'} onclick={() => togglePane('text')}>Text</button>
    <button aria-pressed={pane === 'history'} onclick={() => togglePane('history')}>History</button>
    <button onclick={() => save()} disabled={!dirty || saving} title="Ctrl/Cmd+S">
      {saving ? 'Saving…' : dirty ? 'Save' : 'Saved'}
    </button>
    <details class="menu" bind:open={exportOpen}>
      <summary>Export</summary>
      <div class="items">
        <button onclick={() => exportAs('yaml')} disabled={text === null}>YAML (the text)</button>
        <button onclick={() => exportAs('mermaid')} disabled={!shown}>Mermaid (the graph)</button>
        <button onclick={() => exportAs('svg')} disabled={!shown}>SVG (the graph)</button>
        <button onclick={() => exportAs('png')} disabled={!shown}>PNG (the graph)</button>
      </div>
    </details>
    <span class="sep"></span>
    <label
      >View
      <select bind:value={mode} onchange={restart}>
        <option value="ways">Ways into…</option>
        <option value="where">Where things live</option>
        <option value="all">Everything (all ways in)</option>
      </select>
    </label>
    {#if mode === 'ways'}
      <label
        >Thing
        <select bind:value={target} onchange={() => waysInto(target)}>
          {#each thingsByKind as [kind, ids] (kind)}
            <optgroup label={kind}>
              {#each ids as id (id)}<option value={id}>{id}</option>{/each}
            </optgroup>
          {/each}
        </select>
      </label>
      <button onclick={() => (expanded = new Set(model?.things.keys()))}>Expand all</button>
      <button onclick={() => waysInto(target)}>Reset</button>
      <button onclick={tidy} title="Run the full ELK layout now">Tidy</button>
    {/if}
    <label
      >Scenario
      <select bind:value={scenarioName}>
        <option value="">(none)</option>
        {#each [...(model?.scenarios ?? [])] as [name, sc] (name)}
          <option value={name}>{name} ({sc.kind})</option>
        {/each}
      </select>
    </label>
    <span class="sep"></span>
    <label
      >Routing
      <select bind:value={routing} onchange={tidy}>
        <option value="ORTHOGONAL">Orthogonal</option>
        <option value="SPLINES">Splines</option>
        <option value="POLYLINE">Polyline</option>
      </select>
    </label>
    <label
      >Direction
      <select bind:value={direction} onchange={restart}>
        <option value="RIGHT">Left → right</option>
        <option value="DOWN">Top → down</option>
      </select>
    </label>
    <label
      >Placement
      <select bind:value={placement} onchange={tidy}>
        <option value="BRANDES_KOEPF">Brandes–Köpf (fast)</option>
        <option value="NETWORK_SIMPLEX">Network simplex</option>
      </select>
    </label>
    <button onclick={() => fitKey++}>Fit</button>
    {#if plans.length}<span class="muted" title="From ?plan=">with {plans.join(' + ')}</span>{/if}
    {#if conflict !== null}
      <p class="notice">
        This model was saved elsewhere since you opened it.
        <button onclick={loadLatest}>Load the newer version</button>
        (undo brings yours back) or
        <button onclick={() => save(conflict!)}>Overwrite it with yours</button>
      </p>
    {:else if saveError}
      <p class="notice">Couldn't save: {saveError}</p>
    {:else if exportError}
      <p class="notice">Couldn't export: {exportError}</p>
    {/if}
  </header>

  {#if editorOpened && text !== null}
    <section class="text" class:hidden={pane !== 'text'} aria-label="Model text">
      {#await import('./Editor.svelte') then { default: Editor }}
        <Editor
          {text}
          onchange={(t: string) => (text = t)}
          {lint}
          things={() => [...(model?.things ?? [])].map(([id, t]): [string, string] => [id, t.kind])}
          {reveal}
        />
      {:catch e}
        <p class="status">The editor didn't load: {message(e)}</p>
      {/await}
    </section>
  {/if}
  {#if pane === 'history' && text !== null}
    <section class="text" aria-label="History">
      {#await import('./History.svelte') then { default: History }}
        <History {id} latest={revision} current={text} onrestore={restore} />
      {:catch e}
        <p class="status">The history didn't load: {message(e)}</p>
      {/await}
    </section>
  {/if}

  <main class="canvas" class:outdated={shown && (invalid || lost)}>
    {#if shown && (invalid || lost)}
      <p class="badge">Out of date: {invalid ? 'the text has errors' : `${target} is no longer in the model`}</p>
    {/if}
    {#if shown}
      <FlowView
        view={shown.view}
        placed={shown.placed}
        {vertical}
        kind={scenario?.sc.kind ?? ''}
        {selected}
        {fitKey}
        {onnode}
      />
    {:else}
      <p class="status">{error || (model?.things.size === 0 ? 'This model has no things yet.' : 'Loading…')}</p>
    {/if}
  </main>

  <aside class="side">
    {#if scenario}
      <section>
        <h3>{scenarioName} <span class="muted">({scenario.sc.kind})</span></h3>
        <p class="muted">{what(scenario.sc)}</p>
        {#if scenario.sc.note}<p>{scenario.sc.note}</p>{/if}
      </section>
    {/if}

    <section>
      {#if selNode && isJunction(selNode.kind)}
        <h3>{selNode.label} junction</h3>
        <p class="muted mono">{selNode.id}</p>
      {:else if selThing && selected}
        <h3>{selected} <span class="muted">{selThing.kind}</span></h3>
        {#if selThing.tags.length}
          <p class="muted">{selThing.tags.join(', ')}</p>
        {/if}
        {#if selThing.note}<p>{selThing.note}</p>{/if}
        {#if selThing.todo}<p class="todo">todo: {selThing.todo}</p>{/if}
        {#if scenario}
          {#if !scenario.avail.get(selected)}
            <p><b>Gone</b> in this scenario.</p>
          {:else if selReach}
            <p>
              <b>Reached</b>{selReach.a.length ? ` if ${selReach.a.join(', ')}` : ' outright'}
              <br /><span class="mono">via {fmtWhy(selReach.why)}</span>
            </p>
          {:else}
            <p><b>Not reached.</b></p>
          {/if}
          {#if scenario.rows.has(selected)}<p class="row">{scenario.rows.get(selected)![0]}</p>{/if}
        {/if}
        <div class="actions">
          {#if !(mode === 'ways' && target === selected)}
            <button onclick={() => waysInto(selected!)}>Ways into this</button>
          {/if}
          {#if mode === 'ways' && selNode?.expanded && !selNode.root}
            <button onclick={() => collapse(selected!)}>Collapse</button>
          {/if}
        </div>
      {:else}
        <p class="muted">Click a node for details. A <b>+</b> means it has more ways in; clicking expands it.</p>
      {/if}
    </section>

    <section class="legend">
      <h3>Legend</h3>
      <div class="grid">
        {#each KINDS as k (k)}
          <svg width="44" height="18" aria-hidden="true">
            <path d={shapePath(k, 44, 18)} class="lg-shape" style:stroke="var(--k-{k})" />
          </svg>
          <span>{k}</span>
        {/each}
        {#each EDGE_KINDS as k (k)}
          <svg width="44" height="10" aria-hidden="true"><line x1="2" y1="5" x2="42" y2="5" class="lg-{k}" /></svg>
          <span>{k === 'part' ? 'into AND/OR' : k}</span>
        {/each}
      </div>
    </section>

    {#if shown}
      <p class="muted stats">
        {shown.view.nodes.length} nodes · {shown.view.edges.length} edges · ELK {shown.placed.ms} ms
      </p>
    {/if}
  </aside>
</div>

<style>
  .app {
    display: grid;
    grid-template-columns: 1fr 290px;
    grid-template-rows: auto 1fr;
    height: 100%;
  }
  .app.editing {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) 290px;
  }
  .text {
    min-height: 0;
    border-right: 1px solid var(--border);
  }
  .hidden {
    display: none;
  }
  .bar {
    grid-column: 1 / -1;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 14px;
    padding: 8px 12px;
    border-bottom: 1px solid var(--border);
    background: var(--surface);
  }
  .bar label {
    display: flex;
    align-items: center;
    gap: 5px;
    color: var(--muted);
  }
  .bar select,
  .bar button {
    padding: 3px 6px;
    border: 1px solid var(--border);
    border-radius: 5px;
    background: var(--bg);
  }
  .bar button {
    cursor: pointer;
  }
  .bar button:disabled {
    opacity: 0.6;
    cursor: default;
  }
  .menu {
    position: relative;
  }
  .menu summary {
    padding: 3px 6px;
    border: 1px solid var(--border);
    border-radius: 5px;
    background: var(--bg);
    cursor: pointer;
    list-style: none;
  }
  .menu .items {
    position: absolute;
    z-index: 10;
    top: calc(100% + 4px);
    left: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 4px;
    border: 1px solid var(--border);
    border-radius: 5px;
    background: var(--surface);
    white-space: nowrap;
  }
  .menu .items button {
    border: none;
    background: none;
    text-align: left;
  }
  .menu .items button:not(:disabled):hover {
    background: var(--active-line);
  }
  .notice {
    flex-basis: 100%;
    margin: 0;
    padding: 4px 8px;
    border: 1px solid var(--maybe-stroke);
    border-radius: 5px;
    background: var(--maybe-fill);
  }
  .bar button[aria-pressed='true'] {
    border-color: var(--focus);
    color: var(--focus);
  }
  .sep {
    flex: 0 0 1px;
    align-self: stretch;
    background: var(--border);
  }
  .canvas {
    position: relative;
    min-width: 0;
    min-height: 0;
    border-right: 1px solid var(--border);
  }
  .outdated :global(.svelte-flow__viewport) {
    opacity: 0.4;
  }
  .badge {
    position: absolute;
    top: 8px;
    left: 50%;
    z-index: 5;
    max-width: calc(100% - 16px);
    margin: 0;
    padding: 4px 10px;
    overflow: hidden;
    transform: translateX(-50%);
    white-space: nowrap;
    text-overflow: ellipsis;
    border: 1px solid var(--maybe-stroke);
    border-radius: 5px;
    background: var(--maybe-fill);
  }
  .side {
    overflow-y: auto;
    padding: 4px 14px 14px;
    background: var(--surface);
    line-height: 1.45;
  }
  .side section {
    border-bottom: 1px solid var(--border);
    padding: 8px 0;
  }
  .side h3 {
    margin: 4px 0;
    font-size: 13px;
  }
  .side p {
    margin: 4px 0;
  }
  .muted {
    color: var(--muted);
    font-weight: normal;
  }
  .mono {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 11px;
    word-break: break-word;
  }
  .todo {
    color: var(--maybe-stroke);
  }
  .row {
    color: var(--bad-stroke);
    font-weight: 600;
  }
  .actions {
    display: flex;
    gap: 6px;
    margin-top: 6px;
  }
  .actions button {
    padding: 3px 8px;
    border: 1px solid var(--border);
    border-radius: 5px;
    background: var(--bg);
    cursor: pointer;
  }
  .legend .grid {
    display: grid;
    grid-template-columns: 48px 1fr;
    gap: 4px 6px;
    align-items: center;
  }
  .lg-shape {
    fill: var(--surface);
    stroke-width: 1.5;
  }
  .legend line {
    stroke-width: 1.6;
  }
  .lg-in {
    stroke: var(--e-in);
  }
  .lg-access {
    stroke: var(--e-access);
  }
  .lg-recovery {
    stroke: var(--e-recovery);
    stroke-dasharray: 6 4;
  }
  .lg-needs {
    stroke: var(--e-needs);
    stroke-dasharray: 2 3;
  }
  .lg-mirror {
    stroke: var(--e-mirror);
    stroke-dasharray: 8 3 2 3;
  }
  .lg-part {
    stroke: var(--e-part);
    stroke-width: 1;
  }
  .stats {
    font-size: 11px;
  }
  /* Narrow screens: the details go below the graph, and the text replaces both. */
  @media (max-width: 760px) {
    .app {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: auto minmax(0, 1fr) auto;
    }
    .canvas {
      border-right: none;
    }
    .side {
      max-height: 40vh;
      border-top: 1px solid var(--border);
    }
    .app.editing {
      grid-template-columns: minmax(0, 1fr);
    }
    .app.editing .canvas,
    .app.editing .side {
      display: none;
    }
  }
</style>
