<script lang="ts">
  import { untrack } from 'svelte';
  import { expandToDepth, isJunction, waysInView, whereView, type View } from './build';
  import FlowView from './FlowView.svelte';
  import { layout, placeLocally, type Direction, type Placed, type Placement, type Routing } from './layout';
  import { fmtWhy, SECTIONS } from '../../engine/model.ts';
  import { what } from '../../engine/report.ts';
  import { loadModel, outcome, ReachError, type Model } from './data';
  import { shapePath } from './shapes';

  type Mode = 'ways' | 'where' | 'all';
  const DEPTH = 2;

  // Initial settings can come from the URL, e.g. ?target=mail&scenario=nas_dies&dir=DOWN
  const q = new URLSearchParams(location.search);
  const plans = (q.get('plan') ?? '').split(',').filter(Boolean);

  let model = $state.raw<Model | null>(null);
  let error = $state('');
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

  try {
    const m = loadModel(plans);
    // Without ?target=, start on the first critical thing.
    target ||= [...m.things].find(([, t]) => t.critical)?.[0] ?? [...m.things.keys()][0];
    expanded = expandToDepth(m, [untrack(() => target)], DEPTH);
    model = m;
  } catch (e) {
    if (!(e instanceof ReachError)) throw e;
    error = e.message;
  }

  const scenario = $derived(model?.scenarios.has(scenarioName) ? outcome(model, scenarioName) : undefined);
  const vertical = $derived(direction === 'DOWN');

  const view = $derived.by(() => {
    if (!model) return null;
    if (mode === 'where') return whereView(model, scenario);
    if (mode === 'all') return waysInView(model, [...model.things.keys()], 'all', scenario);
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

  const thingsBySection = $derived(
    model
      ? SECTIONS.map((s) => [s, [...model.things].filter(([, t]) => t.section === s).map(([id]) => id)] as const)
      : [],
  );

  const EDGE_KINDS = ['in', 'access', 'recovery', 'needs', 'mirror', 'part'] as const;
</script>

<div class="app">
  <header class="bar">
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
          {#each thingsBySection as [section, ids] (section)}
            <optgroup label={section}>
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
  </header>

  <main class="canvas">
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
      <p class="status">{error || 'Loading…'}</p>
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
        <h3>{selected} <span class="muted">{selThing.section}</span></h3>
        {@const flags = [selThing.critical && 'critical', selThing.sensitive && 'sensitive'].filter(Boolean)}
        {#if flags.length}
          <p class="muted">{flags.join(', ')}</p>
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
        {#each SECTIONS as s (s)}
          <svg width="44" height="18" aria-hidden="true">
            <path d={shapePath(s, 44, 18)} style="fill: var(--surface); stroke: var(--s-{s}); stroke-width: 1.5" />
          </svg>
          <span>{s}</span>
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
  .status {
    padding: 20px;
    color: var(--muted);
    white-space: pre-wrap;
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
</style>
