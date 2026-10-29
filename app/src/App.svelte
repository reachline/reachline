<script lang="ts">
  import {
    Download,
    FileClock,
    FileCode,
    Info,
    RotateCcw,
    SlidersHorizontal,
    UnfoldVertical,
    WandSparkles,
    Waypoints,
  } from '@lucide/svelte';
  import { untrack } from 'svelte';
  import { expandToDepth, waysInView, whereView, type View } from './build';
  import Details from './Details.svelte';
  import FlowView from './FlowView.svelte';
  import Legend from './Legend.svelte';
  import { layout, placeLocally, type Direction, type Placed, type Placement, type Routing } from './layout';
  import { KINDS } from '../../engine/model.ts';
  import type { Conflict } from '../../server/api.ts';
  import { api, ApiFailure, message } from './api';
  import { check, definitionOf } from './check';
  import { download, toMermaid, toPng, toSvg } from './export';
  import { loadModel, outcome, ReachError, type Model } from './data';
  import ModelSwitcher from './ModelSwitcher.svelte';
  import { keep, load } from './prefs';
  import Resizer from './Resizer.svelte';
  import { beforeLeave, follow } from './route.svelte.ts';
  import UserMenu from './UserMenu.svelte';

  let { id, user, onsignout }: { id: number; user: string; onsignout: () => void } = $props();

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
  let exportError = $state('');
  const dirty = $derived(text !== null && text !== saved);
  // The panel beside the graph: which tab is open (none when it's closed), and
  // how wide it is, as this device last had them. Phones start with it closed,
  // since there it covers the graph.
  type Tab = 'details' | 'text' | 'history';
  const TABS = [
    ['details', 'Details', Info],
    ['text', 'Text', FileCode],
    ['history', 'History', FileClock],
  ] as const;
  const PANEL = { min: 280, usual: 380, wide: 640 };
  const lastTab = load('panel.tab');
  let tab = $state<Tab | null>(
    lastTab === null || TABS.some(([t]) => t === lastTab)
      ? (lastTab as Tab | null)
      : matchMedia('(max-width: 760px)').matches
        ? null
        : 'details',
  );
  const lastWidth = load('panel.width');
  let width = $state(typeof lastWidth === 'number' ? lastWidth : PANEL.usual);
  let innerWidth = $state(window.innerWidth);
  const maxWidth = $derived(Math.max(PANEL.min, Math.round(innerWidth * 0.7)));
  $effect(() => keep('panel.tab', tab));
  $effect(() => keep('panel.width', width));
  // Once opened, the editor stays mounted (hidden when closed) to keep its undo history.
  let editorOpened = $state(untrack(() => tab) === 'text');
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
    exportError = '';
    try {
      download(`${name}.${EXT[format]}`, await exported(format));
    } catch (e) {
      exportError = (e as Error).message;
    }
  }

  const EXT = { yaml: 'yml', mermaid: 'mmd', svg: 'svg', png: 'png' };
  const FORMATS = [
    ['yaml', 'YAML (the text)'],
    ['mermaid', 'Mermaid (the graph)'],
    ['svg', 'SVG (the graph)'],
    ['png', 'PNG (the graph)'],
  ] as const;

  async function exported(format: 'yaml' | 'mermaid' | 'svg' | 'png'): Promise<Blob> {
    if (format === 'yaml') return new Blob([text ?? ''], { type: 'text/yaml' });
    if (!shown) throw new Error('there is no graph on screen');
    const kind = scenario?.sc.kind ?? '';
    if (format === 'mermaid') return new Blob([toMermaid(shown.view, vertical, kind)], { type: 'text/plain' });
    // Resolved by the browser, which picks the current theme's side of each pair in app.css.
    const probe = document.body.appendChild(document.createElement('i'));
    const color = (v: string) => {
      probe.style.color = `var(--${v})`;
      return getComputedStyle(probe).color;
    };
    try {
      const { svg, width, height } = toSvg(shown.view, shown.placed, kind, vertical, color);
      return format === 'svg' ? new Blob([svg], { type: 'image/svg+xml' }) : await toPng(svg, width, height);
    } finally {
      probe.remove();
    }
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
      showTab('text');
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

  function showTab(t: Tab | null) {
    tab = t;
    editorOpened ||= t === 'text';
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

  const withStatus = (v: View) => v.nodes.some((n) => n.status);

  let seq = 0;
  $effect(() => {
    const v = view;
    if (!v) return;
    void tidyKey;
    const opts = { direction, routing, placement };
    const prev = restarting ? null : untrack(() => shown?.placed);
    // Nodes are wider while they show a scenario's status, so turning one on or off lays out afresh.
    const resized = untrack(() => shown && withStatus(shown.view) !== withStatus(v));
    const local = prev && !elkNext && !resized;
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

  function setMode(m: Mode) {
    mode = m;
    restart();
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

  const selNode = $derived(selected ? shown?.view.nodes.find((n) => n.id === selected) : undefined);

  const thingsByKind = $derived.by(() => {
    const things = [...(model?.things ?? [])];
    return KINDS.map((k) => [k, things.filter(([, t]) => t.kind === k).map(([id]) => id)] as const);
  });

  const MODES = [
    ['ways', 'Ways in'],
    ['where', 'Where things live'],
    ['all', 'Everything'],
  ] as const;
</script>

<svelte:window {onkeydown} {onbeforeunload} bind:innerWidth />

<div class="app" class:open={tab !== null} style:--panel-w="{Math.min(width, maxWidth)}px">
  <header class="head">
    <a class="home" href="/" onclick={follow} aria-label="Your models" title="Your models"><Waypoints /></a>
    <ModelSwitcher {id} {name} />
    <span class="state muted wide-only" role="status">{saving ? 'Saving…' : dirty ? 'Unsaved changes' : 'Saved'}</span>
    {#if dirty}
      <button
        class="primary"
        onclick={() => save()}
        disabled={saving}
        title="Ctrl/Cmd+S"
        aria-keyshortcuts="Control+S Meta+S">Save</button
      >
    {/if}
    <span class="spacer"></span>
    <button class="quiet" popovertarget="export-menu"><Download /><span class="wide-only">Export</span></button>
    <div id="export-menu" class="menu" popover>
      {#each FORMATS as [format, label] (format)}
        <button
          class="quiet"
          popovertarget="export-menu"
          popovertargetaction="hide"
          onclick={() => exportAs(format)}
          disabled={format === 'yaml' ? text === null : !shown}>{label}</button
        >
      {/each}
    </div>
    <UserMenu {user} {onsignout} />
  </header>

  {#if conflict !== null || saveError || exportError}
    <div class="banner">
      {#if conflict !== null}
        <p class="notice" role="alert">
          This model was saved elsewhere since you opened it.
          <button onclick={loadLatest}>Load the newer version</button>
          (undo brings yours back) or
          <button onclick={() => save(conflict!)}>Overwrite it with yours</button>
        </p>
      {:else if saveError}
        <p class="notice" role="alert">Couldn't save: {saveError}</p>
      {:else}
        <p class="notice" role="alert">Couldn't export: {exportError}</p>
      {/if}
    </div>
  {/if}

  <div class="tools">
    <div class="segmented" role="group" aria-label="View">
      {#each MODES as [m, label] (m)}
        <button class="quiet" aria-pressed={mode === m} onclick={() => setMode(m)}>{label}</button>
      {/each}
    </div>
    {#if mode === 'ways'}
      <span class="group">
        <label class="field inline"
          >Thing
          <select bind:value={target} onchange={() => waysInto(target)}>
            {#each thingsByKind as [kind, ids] (kind)}
              <optgroup label={kind}>
                {#each ids as id (id)}<option value={id}>{id}</option>{/each}
              </optgroup>
            {/each}
          </select>
        </label>
        <button class="quiet" onclick={() => waysInto(target)}><RotateCcw />Reset</button>
        <button class="quiet" onclick={() => (expanded = new Set(model?.things.keys()))}
          ><UnfoldVertical />Expand all</button
        >
      </span>
    {/if}
    <label class="field inline"
      >Scenario
      <select bind:value={scenarioName}>
        <option value="">(none)</option>
        {#each [...(model?.scenarios ?? [])] as [name, sc] (name)}
          <option value={name}>{name} ({sc.kind})</option>
        {/each}
      </select>
    </label>
    {#if plans.length}<span class="muted" title="From ?plan=">with {plans.join(' + ')}</span>{/if}
  </div>

  <div class="tabs">
    <div class="segmented" role="group" aria-label="Panel">
      {#each TABS as [t, label, Icon] (t)}
        <button
          class="quiet"
          aria-pressed={tab === t}
          aria-controls="panel"
          onclick={() => showTab(tab === t ? null : t)}><Icon />{label}</button
        >
      {/each}
    </div>
  </div>

  <main class="canvas" class:outdated={shown && (invalid || lost)}>
    {#if shown && (invalid || lost)}
      <p class="notice badge" role="status">
        Out of date: {invalid ? 'the text has errors' : `${target} is no longer in the model`}
      </p>
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
        ondeselect={() => (selected = null)}
      >
        {#snippet tools()}
          <button class="quiet" onclick={tidy} title="Lay the whole graph out again"><WandSparkles />Tidy</button>
          <button class="quiet" popovertarget="layout"><SlidersHorizontal />Layout</button>
          <div id="layout" class="popup" popover>
            <h2>Layout</h2>
            <label class="field"
              >Direction
              <select bind:value={direction} onchange={restart}>
                <option value="RIGHT">Left to right</option>
                <option value="DOWN">Top to bottom</option>
              </select>
            </label>
            <label class="field"
              >Edges
              <select bind:value={routing} onchange={tidy}>
                <option value="ORTHOGONAL">Right angles</option>
                <option value="SPLINES">Curves</option>
                <option value="POLYLINE">Straight segments</option>
              </select>
            </label>
            <label class="field"
              >Placement
              <select bind:value={placement} onchange={tidy}>
                <option value="BRANDES_KOEPF">Brandes–Köpf (fast)</option>
                <option value="NETWORK_SIMPLEX">Network simplex</option>
              </select>
            </label>
            {#if shown}
              <p class="muted stats">
                {shown.view.nodes.length} nodes, {shown.view.edges.length} edges, laid out in {shown.placed.ms} ms
              </p>
            {/if}
          </div>
          <Legend />
        {/snippet}
      </FlowView>
    {:else}
      <p class="status">{error || (model?.things.size === 0 ? 'This model has no things yet.' : 'Loading…')}</p>
    {/if}
  </main>

  <aside id="panel" class="panel" class:hidden={tab === null} aria-label="Panel">
    <Resizer bind:width min={PANEL.min} max={maxWidth} usual={PANEL.usual} wide={PANEL.wide} />
    {#if tab === 'details'}
      <Details
        {model}
        {scenario}
        {scenarioName}
        {selected}
        node={selNode}
        target={mode === 'ways' ? target : null}
        onwaysinto={waysInto}
        oncollapse={collapse}
      />
    {/if}
    {#if editorOpened && text !== null}
      <section class="tab" class:hidden={tab !== 'text'} aria-label="Model text">
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
    {#if tab === 'history' && text !== null}
      <section class="tab" aria-label="History">
        {#await import('./History.svelte') then { default: History }}
          <History {id} latest={revision} current={text} onrestore={restore} />
        {:catch e}
          <p class="status">The history didn't load: {message(e)}</p>
        {/await}
      </section>
    {/if}
  </aside>
</div>

<style>
  /*
   * The document's header across the top; under it, what the graph shows, and
   * the panel's tabs, over the graph and the panel. Closed, the panel gives
   * the graph its room and leaves its tabs at the end of the toolbar.
   */
  .app {
    display: grid;
    grid-template:
      'head head' auto
      'banner banner' auto
      'tools tabs' auto
      'canvas canvas' minmax(0, 1fr)
      / minmax(0, 1fr) auto;
    height: 100%;
  }
  .app.open {
    grid-template:
      'head head' auto
      'banner banner' auto
      'tools tabs' auto
      'canvas panel' minmax(0, 1fr)
      / minmax(0, 1fr) var(--panel-w);
  }
  .head {
    grid-area: head;
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
    padding: var(--space-2) var(--space-3);
    border-bottom: 1px solid var(--border);
    background: var(--surface);
  }
  .home {
    display: inline-flex;
    padding: var(--space-1);
    color: var(--accent);
  }
  .state {
    font-size: var(--text-sm);
    white-space: nowrap;
  }
  .spacer {
    flex: 1;
  }
  .banner {
    grid-area: banner;
    padding: var(--space-2) var(--space-3);
    border-bottom: 1px solid var(--border);
  }
  .tools,
  .tabs {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2) var(--space-4);
    min-width: 0;
    padding: var(--space-2) var(--space-3);
    border-bottom: 1px solid var(--border);
    background: var(--surface);
  }
  .tools {
    grid-area: tools;
    column-gap: var(--space-3);
  }
  /* A long scenario or thing name shouldn't push the toolbar onto two rows. */
  .tools select {
    max-width: 11rem;
  }
  .tabs {
    grid-area: tabs;
    justify-content: flex-end;
  }
  .open .tabs {
    justify-content: flex-start;
    border-left: 1px solid var(--border);
  }
  .group {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-1);
  }
  .group .field {
    margin-right: var(--space-1);
  }
  .canvas {
    grid-area: canvas;
    position: relative;
    min-width: 0;
    min-height: 0;
  }
  .outdated :global(.svelte-flow__viewport) {
    opacity: 0.4;
  }
  .badge {
    position: absolute;
    top: var(--space-2);
    left: 50%;
    z-index: 5;
    max-width: calc(100% - 2 * var(--space-2));
    overflow: hidden;
    transform: translateX(-50%);
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .panel {
    grid-area: panel;
    position: relative;
    min-width: 0;
    min-height: 0;
    border-left: 1px solid var(--border);
    background: var(--surface);
  }
  .tab {
    height: 100%;
  }
  .hidden {
    display: none;
  }
  .stats {
    font-size: var(--text-sm);
  }
  #layout {
    min-width: 14rem;
  }
  #layout h2 {
    font-size: var(--text-md);
  }

  /* Phones: the panel, open, covers the graph. */
  @media (max-width: 760px) {
    .app,
    .app.open {
      grid-template:
        'head' auto
        'banner' auto
        'tools' auto
        'tabs' auto
        'canvas' minmax(0, 1fr)
        / minmax(0, 1fr);
    }
    .app.open {
      grid-template-areas: 'head' 'banner' 'tools' 'tabs' 'panel';
    }
    .app.open .canvas {
      display: none;
    }
    .open .tabs {
      border-left: none;
    }
    .tabs {
      justify-content: flex-start;
    }
    .panel {
      border-left: none;
    }
    .panel :global(.resizer) {
      display: none;
    }
  }
</style>
