<script lang="ts">
  import {
    Download,
    FileClock,
    FileCode,
    Info,
    Layers,
    Plus,
    Redo2,
    RotateCcw,
    SlidersHorizontal,
    TextAlignStart,
    Undo2,
    UnfoldVertical,
    WandSparkles,
    Waypoints,
  } from '@lucide/svelte';
  import { untrack } from 'svelte';
  import { expandToDepth, waysInView, whereView, type View } from './build';
  import AddDialog from './AddDialog.svelte';
  import Details from './Details.svelte';
  import {
    addPlan,
    addScenario,
    addThing,
    applyPlan,
    changes,
    edit,
    overlaps,
    planFields,
    plansOf,
    removePlan,
    renamePlan,
    setPlanNote,
    removeScenario,
    removeThing,
    renameScenario,
    renameThing,
    setField,
    setMe,
    setScenarioField,
    validId,
    written,
    type Change,
    type Created,
    type Edit,
    type Editing,
    type Layer,
  } from './edit';
  import FlowView from './FlowView.svelte';
  import Legend from './Legend.svelte';
  import { layout, placeLocally, type Direction, type Placed, type Placement, type Routing } from './layout';
  import { KINDS, SCENARIO_KINDS } from '../../engine/model.ts';
  import { compare, type ScenarioChange } from '../../engine/report.ts';
  import Plans from './Plans.svelte';
  import TemplateDialog from './TemplateDialog.svelte';
  import type { Template } from './template';
  import Verdicts from './Verdicts.svelte';
  import type { Conflict } from '../../server/api.ts';
  import { api, ApiFailure, message } from './api';
  import { check, definitionOf } from './check';
  import { download, toMermaid, toPng, toSvg } from './export';
  import { format } from './format';
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
  // The plans that are on, kept in ?plan=. They apply in the order the document lists them.
  let on = $state((q.get('plan') ?? '').split(',').filter(Boolean));
  const inOrder = (t: string) =>
    plansOf(t)
      .map((p) => p.name)
      .filter((n) => on.includes(n));

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
  let editError = $state('');
  const dirty = $derived(text !== null && text !== saved);
  // The panel beside the graph: which tab is open (none when it's closed), and
  // how wide it is, as this device last had them. Phones start with it closed,
  // since there it covers the graph.
  type Tab = 'details' | 'text' | 'history' | 'plans';
  const TABS = [
    ['details', 'Details', Info],
    ['text', 'Text', FileCode],
    ['history', 'History', FileClock],
    ['plans', 'Plans', Layers],
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
  let editor = $state<{ undo: () => void; redo: () => void }>();
  const mounted: { resolve?: () => void } = {};
  const editorMounted = new Promise<void>((resolve) => (mounted.resolve = resolve));
  const loadEditor = () => import('./Editor.svelte');
  let editorModule = $state(untrack(() => editorOpened) ? loadEditor() : undefined);
  let steps = $state({ undo: 0, redo: 0 });
  let formatError = $state('');
  // The latest text doesn't load, so the graph shows the last text that did.
  let invalid = $state(false);
  // The text last checked. Checking waits for typing to pause, so the text can be ahead of it.
  let checked = $state<string | null>(null);
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
      void setText(doc.text);
    } catch (e) {
      saveError = message(e);
    }
  }

  /** Saves an old revision's text as a new revision; undo brings back what was there. */
  async function restore(t: string) {
    await setText(t);
    void save();
  }

  /**
   * Text from outside the editor. It waits for the editor, so that it's one
   * edit in its history, which undo can take back.
   */
  async function setText(t: string) {
    openEditor();
    try {
      await editorModule;
      await editorMounted;
    } catch {
      // Without the editor there's no undo, but the change still stands.
    }
    text = t;
    lint(t);
  }

  function openEditor() {
    editorOpened = true;
    editorModule ??= loadEditor();
  }

  function formatText() {
    if (text === null) return;
    formatError = '';
    try {
      void setText(format(text));
    } catch {
      formatError = 'Only text without YAML errors can be formatted.';
    }
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
    if (!(e.metaKey || e.ctrlKey) || e.defaultPrevented) return;
    const key = e.key.toLowerCase();
    if (key === 's') {
      e.preventDefault();
      if (dirty) void save();
    }
    // Outside the editor (which has its own keys) and fields (which have their own undo).
    const field =
      e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable], .editor');
    if (field || !editor) return;
    if (key === 'z' || key === 'y') {
      e.preventDefault();
      if (key === 'y' || e.shiftKey) editor.redo();
      else editor.undo();
    }
  }

  function onbeforeunload(e: BeforeUnloadEvent) {
    if (dirty) e.preventDefault();
  }

  function open(t: string) {
    try {
      show(loadModel(t, inOrder(t)));
      checked = t;
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
    const { model: m, problems } = check(t, inOrder(t));
    invalid = !m;
    checked = t;
    if (m) show(m);
    return problems;
  }

  function showTab(t: Tab | null) {
    tab = t;
    if (t === 'text') openEditor();
  }

  // Guided edits. They go to one layer: the model itself, or a plan.
  let editMode = $state(load('details.edit') === true);
  $effect(() => keep('details.edit', editMode));
  let chosenLayer = $state<Layer>(null);
  const planList = $derived(text === null ? [] : plansOf(text));
  const plans = $derived(planList.map((p) => p.name).filter((n) => on.includes(n)));
  // A plan that's gone (deleted, or undone) can't take edits: they'd make it again.
  const layer = $derived(planList.some((p) => p.name === chosenLayer) ? chosenLayer : null);

  /** Turns plans on or off, and shows the model with them. */
  function setOn(next: string[]) {
    on = next;
    if (layer !== null && !next.includes(layer)) chosenLayer = null;
    const url = new URL(location.href);
    if (next.length) url.searchParams.set('plan', next.join(','));
    else url.searchParams.delete('plan');
    history.replaceState(history.state, '', url);
    if (text !== null) lint(text);
  }

  /** Where edits go; a plan they go into is on. */
  function setLayer(l: Layer) {
    chosenLayer = l;
    if (l !== null && !on.includes(l)) setOn([...on, l]);
  }
  let addThingDialog = $state<HTMLDialogElement>();
  let addScenarioDialog = $state<HTMLDialogElement>();
  let templateDialog = $state<HTMLDialogElement>();

  function setEditMode(on: boolean) {
    editMode = on;
    // Mounted, the editor keeps the guided edits in its history.
    if (on) openEditor();
  }

  /** Applies edits to the text, as one step undo can take back. */
  function apply(...edits: Edit[]): boolean {
    if (text === null) return false;
    editError = '';
    try {
      void setText(edit(text, ...edits));
      return true;
    } catch (e) {
      editError = (e as Error).message;
      return false;
    }
  }

  const creating = (created: Created[] = []) => created.map(({ id, kind }) => addThing(layer, id, { kind }));

  const editing = $derived.by((): Editing | null => {
    // Only text that's been checked and loads: forms never read text half typed.
    if (text === null || text !== checked || !model || invalid) return null;
    const w = written(text, layer);
    const t = text;
    return {
      layer,
      plans: planList.map((p) => p.name),
      setLayer,
      sets: (section, id) => (layer === null ? [] : planFields(t, layer, section, id)),
      inModel: (section, id) => !!written(t, null)[section][id],
      revert: (section, id, field) => {
        const value = (written(t, null)[section][id] as Record<string, unknown> | undefined)?.[field];
        apply(section === 'things' ? setField(layer, id, field, value) : setScenarioField(layer, id, field, value));
      },
      written: w,
      ids: new Map(Object.entries(w.things).map(([id, spec]) => [id, String(spec.kind)])),
      setThing: (id, field, value, created) => apply(...creating(created), setField(layer, id, field, value)),
      setScenario: (name, field, value, created) =>
        apply(...creating(created), setScenarioField(layer, name, field, value)),
      setMe: (me, created) => apply(...creating(created), setMe(layer, me)),
      renameThing: (from, to) => {
        const problem = nameProblem(to, Object.keys(w.things));
        if (problem || !apply(renameThing(from, to))) return problem || editError;
        if (selected === from) selected = to;
        if (target === from) target = to;
        expanded = new Set([...expanded].map((x) => (x === from ? to : x)));
        return '';
      },
      renameScenario: (from, to) => {
        const problem = nameProblem(to, Object.keys(w.scenarios));
        if (problem || !apply(renameScenario(from, to))) return problem || editError;
        if (scenarioName === from) scenarioName = to;
        return '';
      },
      deleteThing: (id) =>
        confirmEdit(
          `Delete ${id}?`,
          layer === null
            ? `It goes from the model and every plan. Ways in that need it go too; where it's one of several options, the others stay.`
            : `The plan removes it, and what refers to it.`,
          removeThing(layer, id),
          () => {
            if (selected === id) selected = null;
          },
        ),
      deleteScenario: (name) =>
        confirmEdit(
          `Delete ${name}?`,
          'The scenario goes, and nothing else changes.',
          removeScenario(layer, name),
          () => {
            scenarioName = 'baseline';
          },
        ),
    };
  });

  function nameProblem(name: string, taken: string[]): string {
    if (!validId(name)) return 'Use lowercase letters, digits and _, starting with a letter.';
    if (taken.includes(name)) return `${name} is already taken.`;
    return '';
  }

  // An edit waiting for confirmation, with what it would change.
  let confirmDialog = $state<HTMLDialogElement>();
  interface Asking {
    title: string;
    text: string;
    action: string;
    changes: Change[];
    verdicts: ScenarioChange[] | null;
    warnings: string[];
    edit: Edit;
    then: () => void;
  }
  let asking = $state<Asking | null>(null);

  function confirmEdit(
    title: string,
    body: string,
    e: Edit,
    then: () => void,
    { action = 'Delete', of = layer, verdicts = true }: { action?: string; of?: Layer; verdicts?: boolean } = {},
  ) {
    if (text === null) return;
    editError = '';
    try {
      const after = edit(text, e);
      // Plans other than the one changed that wouldn't load afterwards.
      const warnings = planList
        .filter((p) => p.name !== of && plansOf(after).some((q) => q.name === p.name))
        .flatMap((p) => {
          try {
            loadModel(after, [p.name]);
            return [];
          } catch (err) {
            return [`${p.name} would no longer load: ${(err as Error).message}`];
          }
        });
      asking = {
        title,
        text: body,
        action,
        changes: changes(written(text, of), written(after, of)),
        verdicts: verdicts ? verdictsAfter(after) : null,
        warnings,
        edit: e,
        then,
      };
      confirmDialog?.showModal();
    } catch (err) {
      editError = (err as Error).message;
    }
  }

  /** How verdicts compare, with the plans that are on, between two texts; null if either doesn't load. */
  function compareTexts(before: string, after: string, beforePlans: string[], afterPlans: string[]) {
    try {
      const [b, a] = [loadModel(before, beforePlans), loadModel(after, afterPlans)];
      return compare(b, a, [...new Set([...a.scenarios.keys(), ...b.scenarios.keys()])]);
    } catch {
      return null;
    }
  }

  const verdictsAfter = (after: string) => (text === null ? null : compareTexts(text, after, plans, inOrder(after)));

  function confirmed() {
    confirmDialog?.close();
    if (asking && apply(asking.edit)) asking.then();
    asking = null;
  }

  function turn(name: string, isOn: boolean) {
    setOn(isOn ? [...on, name] : on.filter((n) => n !== name));
  }

  function editPlan(name: Layer) {
    setLayer(name);
    setEditMode(true);
    showTab('details');
  }

  function createPlan(name: string, note: string) {
    if (apply(addPlan(name, note))) editPlan(name);
  }

  function renamePlanTo(from: string, to: string): string {
    const problem = nameProblem(
      to,
      planList.map((p) => p.name),
    );
    if (problem || !apply(renamePlan(from, to))) return problem || editError;
    on = on.map((n) => (n === from ? to : n));
    setOn(on);
    if (chosenLayer === from) chosenLayer = to;
    return '';
  }

  function applyPlanNamed(name: string) {
    confirmEdit(
      `Apply ${name}?`,
      'Its changes become part of the model, and the plan goes. These are the changes to the model:',
      applyPlan(name),
      () => setOn(on.filter((n) => n !== name)),
      { action: 'Apply', of: null, verdicts: false },
    );
  }

  function deletePlanNamed(name: string) {
    confirmEdit(
      `Delete ${name}?`,
      'The plan and everything in it goes. The model doesn’t change.',
      removePlan(name),
      () => setOn(on.filter((n) => n !== name)),
      { of: null, verdicts: false },
    );
  }

  // With plans on: the model with them against without them, while the Plans tab shows it.
  const comparison = $derived(
    tab === 'plans' && text !== null && plans.length && !invalid ? compareTexts(text, text, [], plans) : null,
  );

  function added(id: string, kind: string) {
    if (!apply(addThing(layer, id, { kind }))) return;
    selected = id;
    setEditMode(true);
    showTab('details');
  }

  function addedScenario(name: string, kind: string) {
    if (!apply(addScenario(layer, name, kind === 'breach' ? { kind, attacker: [] } : { kind, lost: [] }))) return;
    scenarioName = name;
    setEditMode(true);
    showTab('details');
  }

  type Things = Record<string, Record<string, unknown>>;
  const adding = (layer: Layer, things: Things) =>
    Object.entries(things).map(([id, spec]) => addThing(layer, id, spec));

  function previewTemplate(things: Things) {
    if (text === null) return null;
    try {
      return verdictsAfter(edit(text, ...adding(null, things)));
    } catch {
      return null;
    }
  }

  /** A template's things go into the model, or into a plan of their own to weigh first. */
  function addedTemplate(t: Template, prefix: string, things: Things, asPlan: boolean) {
    const main = prefix in things ? prefix : null;
    if (!asPlan) {
      if (!apply(...adding(null, things))) return;
      if (main) selected = main;
      showTab('details');
      return;
    }
    const taken = planList.map((p) => p.name);
    let name = `add_${prefix}`;
    for (let i = 2; taken.includes(name); i++) name = `add_${prefix}_${i}`;
    if (!apply(addPlan(name, `From the ${t.name} template`), ...adding(name, things))) return;
    setOn([...on, name]);
    if (main) selected = main;
    showTab('plans');
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
    <button class="quiet" popovertarget="add-menu" disabled={!editing}
      ><Plus /><span class="wide-only">Add</span></button
    >
    <div id="add-menu" class="menu" popover>
      <button
        class="quiet"
        popovertarget="add-menu"
        popovertargetaction="hide"
        onclick={() => addThingDialog?.showModal()}>Thing…</button
      >
      <button
        class="quiet"
        popovertarget="add-menu"
        popovertargetaction="hide"
        onclick={() => addScenarioDialog?.showModal()}>Scenario…</button
      >
      <button
        class="quiet"
        popovertarget="add-menu"
        popovertargetaction="hide"
        onclick={() => templateDialog?.showModal()}>From a template…</button
      >
    </div>
    <button
      class="quiet icon"
      aria-label="Undo"
      title="Undo"
      aria-keyshortcuts="Control+Z Meta+Z"
      disabled={!steps.undo}
      onclick={() => editor?.undo()}><Undo2 /></button
    >
    <button
      class="quiet icon"
      aria-label="Redo"
      title="Redo"
      aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z"
      disabled={!steps.redo}
      onclick={() => editor?.redo()}><Redo2 /></button
    >
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

  {#if conflict !== null || saveError || exportError || editError}
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
      {:else if editError}
        <p class="notice" role="alert">Couldn't make that change: {editError}</p>
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
    {#if plans.length}<span class="muted">with {plans.join(' + ')}</span>{/if}
  </div>

  <!-- Open, the tabs are as wide as the panel, and give their words up to fit it. -->
  <div class="tabs" class:shrinks={tab !== null}>
    <div class="segmented" role="group" aria-label="Panel">
      {#each TABS as [t, label, Icon] (t)}
        <button
          class="quiet"
          aria-pressed={tab === t}
          aria-controls="panel"
          onclick={() => showTab(tab === t ? null : t)}><Icon /><span class="wide-only">{label}</span></button
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
        edit={editMode}
        {editing}
        onedit={setEditMode}
        ontext={() => showTab('text')}
      />
    {/if}
    {#if editorOpened && editorModule && text !== null}
      <section class="tab text" class:hidden={tab !== 'text'} aria-label="Model text">
        <div class="bar">
          <button class="quiet" onclick={formatText} title="Lay the text out the way guided edits do, without comments"
            ><TextAlignStart />Format</button
          >
          {#if formatError}<p class="error" role="alert">{formatError}</p>{/if}
        </div>
        {#await editorModule then { default: Editor }}
          <Editor
            bind:this={editor}
            {text}
            onchange={(t: string) => {
              text = t;
              formatError = '';
            }}
            {lint}
            things={() => [...(model?.things ?? [])].map(([id, t]): [string, string] => [id, t.kind])}
            {reveal}
            onhistory={(undo: number, redo: number) => (steps = { undo, redo })}
            onready={() => mounted.resolve?.()}
          />
        {:catch e}
          <p class="status">The editor didn't load: {message(e)}</p>
        {/await}
      </section>
    {/if}
    {#if tab === 'plans'}
      <Plans
        plans={planList}
        {on}
        {layer}
        overlaps={text === null ? [] : overlaps(text, plans)}
        {comparison}
        editable={!!editing}
        onturn={turn}
        onedit={editPlan}
        onapply={applyPlanNamed}
        ondelete={deletePlanNamed}
        oncreate={createPlan}
        onrename={renamePlanTo}
        onnote={(name: string, note: string) => apply(setPlanNote(name, note))}
      />
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

<AddDialog
  bind:dialog={addThingDialog}
  title="Add a thing"
  kinds={KINDS}
  taken={(n: string) => !!editing?.ids.has(n)}
  onadd={(n: string, k: string) => added(n, k)}
/>
<AddDialog
  bind:dialog={addScenarioDialog}
  title="Add a scenario"
  kinds={SCENARIO_KINDS}
  taken={(n: string) => !!editing?.written.scenarios[n]}
  onadd={(n: string, k: string) => addedScenario(n, k)}
/>
<TemplateDialog
  bind:dialog={templateDialog}
  ids={editing?.ids ?? new Map<string, string>()}
  preview={previewTemplate}
  onadd={(t: Template, prefix: string, things: Things, asPlan: boolean) => addedTemplate(t, prefix, things, asPlan)}
/>
<dialog
  bind:this={confirmDialog}
  aria-labelledby="confirm-title"
  aria-describedby="confirm-text"
  onclose={() => (asking = null)}
>
  {#if asking}
    <div class="confirm">
      <h2 id="confirm-title">{asking.title}</h2>
      <p id="confirm-text">{asking.text}</p>
      {#each asking.warnings as w (w)}<p class="notice">{w}</p>{/each}
      {#if asking.changes.length}
        <ul class="changes">
          {#each asking.changes as c, i (i)}
            <li>
              <b class="mono">{c.id}</b>{#if c.field}&nbsp;{c.field}{/if}:
              {#if c.field}<span class="mono">{c.before}</span>&nbsp;→&nbsp;{/if}<span class="mono">{c.after}</span>
            </li>
          {/each}
        </ul>
      {/if}
      {#if asking.verdicts}
        <h3>Verdicts</h3>
        <div class="scroll"><Verdicts changes={asking.verdicts} /></div>
      {/if}
      <div class="buttons">
        <button class="quiet" onclick={() => confirmDialog?.close()}>Cancel</button>
        <button class={asking.action === 'Delete' ? 'danger' : 'primary'} onclick={confirmed}>{asking.action}</button>
      </div>
    </div>
  {/if}
</dialog>

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
  .text {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
  }
  .bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-1) var(--space-2);
    border-bottom: 1px solid var(--border);
  }
  .bar .error {
    font-size: var(--text-sm);
  }
  .hidden {
    display: none;
  }
  .confirm {
    display: grid;
    gap: var(--space-4);
    padding: var(--space-5);
  }
  .confirm h2 {
    font-size: var(--text-lg);
  }
  .confirm h3 {
    font-size: var(--text-md);
  }
  .scroll {
    max-height: 30vh;
    overflow-y: auto;
  }
  .changes {
    display: grid;
    gap: var(--space-2);
    max-height: 40vh;
    margin: 0;
    padding-left: var(--space-4);
    overflow-y: auto;
    font-size: var(--text-sm);
  }
  .buttons {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
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
