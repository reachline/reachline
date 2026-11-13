<script lang="ts">
  import {
    ChevronDown,
    ChevronUp,
    Download,
    FileClock,
    FileCode,
    Info,
    Layers,
    LogIn,
    MapPin,
    Network,
    Pencil,
    Plus,
    Redo2,
    RotateCcw,
    ShieldAlert,
    TextAlignStart,
    Undo2,
    WandSparkles,
  } from '@lucide/svelte';
  import { untrack } from 'svelte';
  import { expandToDepth, outcome, waysInView, whereView, type View } from '../../../engine/view.ts';
  import type { Side } from '../graph/nodes';
  import AddDialog from '../dialogs/AddDialog.svelte';
  import type { Question } from '../dialogs/confirm';
  import ConfirmEdit from '../dialogs/ConfirmEdit.svelte';
  import Details from '../panel/Details.svelte';
  import Home from '../shell/Home.svelte';
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
    nameProblem,
    written,
    type Change,
    type Created,
    type Edit,
    type Editing,
    type Layer,
  } from '../lib/edit';
  import FlowView from '../graph/FlowView.svelte';
  import LayoutMenu from '../graph/LayoutMenu.svelte';
  import Legend from '../graph/Legend.svelte';
  import { layout, placeLocally, type Direction, type Placed, type Placement, type Routing } from '../graph/layout';
  import { BASELINE, KINDS, SCENARIO_KINDS } from '../../../engine/model.ts';
  import type { ScenarioChange } from '../../../engine/report.ts';
  import Plans from '../panel/Plans.svelte';
  import Scenarios from '../panel/Scenarios.svelte';
  import TemplateDialog from '../dialogs/TemplateDialog.svelte';
  import type { Template } from '../dialogs/template';
  import type { Conflict } from '../../../server/api.ts';
  import { api, ApiFailure, message } from '../lib/api';
  import { check, definitionOf } from '../lib/check';
  import { download, exportGraph } from '../graph/export';
  import { format } from '../lib/format';
  import { compareTexts, ReachError, summary, tryLoad, type Model } from '../lib/data';
  import ModelSwitcher from '../shell/ModelSwitcher.svelte';
  import Picker, { type PickerGroup } from '../shell/Picker.svelte';
  import { keep, load } from '../lib/prefs';
  import Resizer from '../shell/Resizer.svelte';
  import { beforeLeave, setQuery } from '../lib/route.svelte.ts';
  import UserMenu from '../shell/UserMenu.svelte';

  let { id, user, onsignout }: { id: number; user: string; onsignout: () => void } = $props();

  type Mode = 'ways' | 'where' | 'all';
  const DEPTH = 2;

  // What the graph shows is kept in the URL, e.g. ?target=mail&scenario=nas_dies,
  // so a reload or a link comes back to it, and on this device, so that a link
  // without one opens the model as it was last left. How it's laid out is this device's.
  const VIEW = ['mode', 'target', 'scenario', 'plan', 'into', 'select'];
  const viewKey = `view.${untrack(() => id)}`;
  const given = new URLSearchParams(location.search);
  const kept = load(viewKey);
  const restored = !VIEW.some((k) => given.has(k)) && !!kept && typeof kept === 'object';
  const q = new URLSearchParams([
    ...given,
    ...(restored
      ? Object.entries(kept).flatMap(([k, v]) => (VIEW.includes(k) && typeof v === 'string' ? [[k, v]] : []))
      : []),
  ]);
  // A setting kept in a link or the browser may be out of date, so it's checked.
  const oneOf = <T extends string>(v: unknown, allowed: readonly T[], usual: T): T =>
    allowed.includes(v as T) ? (v as T) : usual;
  // The plans that are on. They apply in the order the document lists them.
  // The one edits go into is always among them.
  const into = q.get('into') ?? null;
  const planned = (q.get('plan') ?? '').split(',').filter(Boolean);
  let on = $state(into && !planned.includes(into) ? [...planned, into] : planned);
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
  // since there it covers the graph. The first three are about what the
  // toolbar has chosen; the others, the document.
  type Tab = 'details' | 'scenarios' | 'text' | 'history' | 'plans';
  const TABS = [
    ['details', 'Details', Info],
    ['scenarios', 'Scenario', ShieldAlert],
    ['plans', 'Plans', Layers],
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
  // On phones, what the graph shows folds into one row, open or not as this device last had it.
  const phone = $derived(innerWidth <= 760);
  let lensOpen = $state(load('lens.open') === true);
  $effect(() => keep('lens.open', lensOpen));
  // Once opened, the editor stays mounted (hidden when closed) to keep its undo history.
  let editorOpened = $state(untrack(() => tab) === 'text');
  let editor = $state<{ undo: () => void; redo: () => void }>();
  const mounted: { resolve?: () => void } = {};
  const editorMounted = new Promise<void>((resolve) => (mounted.resolve = resolve));
  const loadEditor = () => import('../panel/Editor.svelte');
  let editorModule = $state(untrack(() => editorOpened) ? loadEditor() : undefined);
  let steps = $state({ undo: 0, redo: 0 });
  let formatError = $state('');
  // The latest text doesn't load, so the graph shows the last text that did.
  let invalid = $state(false);
  // Why the plans that are on don't load with the model, when the model loads without them.
  let planError = $state('');
  // The text last checked. Checking waits for typing to pause, so the text can be ahead of it.
  let checked = $state<string | null>(null);
  // Where the thing last selected in the graph is defined, for the editor to show.
  let reveal = $state.raw<{ from: number; to: number } | null>(null);
  let mode = $state(oneOf<Mode>(q.get('mode'), ['ways', 'where', 'all'], 'ways'));
  let target = $state(q.get('target') ?? '');
  let scenarioName = $state(q.get('scenario') ?? '');
  // A layout from a link becomes this device's.
  const ROUTINGS = ['ORTHOGONAL', 'SPLINES', 'POLYLINE'] as const;
  let routing = $state(oneOf<Routing>(q.get('routing') ?? load('layout.routing'), ROUTINGS, 'ORTHOGONAL'));
  let direction = $state(oneOf<Direction>(q.get('dir') ?? load('layout.dir'), ['RIGHT', 'DOWN'], 'RIGHT'));
  const PLACEMENTS = ['BRANDES_KOEPF', 'NETWORK_SIMPLEX'] as const;
  let placement = $state(oneOf<Placement>(q.get('place') ?? load('layout.place'), PLACEMENTS, 'BRANDES_KOEPF'));
  $effect(() => keep('layout.routing', routing));
  $effect(() => keep('layout.dir', direction));
  $effect(() => keep('layout.place', placement));
  // The nodes whose ways in are shown, and those whose ways into other things are.
  let expanded = $state.raw<Set<string>>(new Set());
  let forward = $state.raw<Set<string>>(new Set());
  let selected = $state<string | null>(q.get('select'));
  $effect(() => {
    const view: Record<string, string> = {};
    if (mode !== 'ways') view.mode = mode;
    if (target) view.target = target;
    if (scenarioName) view.scenario = scenarioName;
    if (on.length) view.plan = on.join(',');
    if (chosenLayer) view.into = chosenLayer;
    if (selected) view.select = selected;
    setQuery(view);
    keep(viewKey, view);
  });

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
    return exportGraph(format, shown.view, shown.placed, scenario?.sc.kind ?? '', vertical);
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
    const m = tryLoad(t, inOrder(t));
    if (m instanceof ReachError) {
      error = m.message;
      planError = whyPlans(t);
      showTab(planError ? 'plans' : 'text');
    } else {
      show(m);
      checked = t;
    }
  }

  /** What's wrong with the plans that are on, if the model loads without them. */
  function whyPlans(t: string): string {
    const on = inOrder(t);
    if (!on.length || tryLoad(t) instanceof ReachError) return '';
    const m = tryLoad(t, on);
    return m instanceof ReachError ? m.message : '';
  }

  /** Show a model that loaded. The first one picks the starting view; later ones keep it. */
  function show(m: Model) {
    if (!untrack(() => model)) {
      // Without ?target=, the user chooses one: any guess would rarely be the thing they came for.
      // One kept from last time that's gone since is dropped, rather than reported as a link's would be.
      if (restored && !m.things.has(untrack(() => target))) target = '';
      const t = untrack(() => target);
      if (m.things.has(t)) [expanded, forward] = [expandToDepth(m, [t], DEPTH), new Set()];
    }
    model = m;
    error = '';
  }

  function lint(t: string) {
    const { model: m, problems } = check(t, inOrder(t));
    invalid = !m;
    planError = m ? '' : whyPlans(t);
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
  let chosenLayer = $state<Layer>(into);
  const planList = $derived(text === null ? [] : plansOf(text));
  const plans = $derived(planList.map((p) => p.name).filter((n) => on.includes(n)));
  // A plan that's gone (deleted, or undone) can't take edits: they'd make it again.
  const layer = $derived(planList.some((p) => p.name === chosenLayer) ? chosenLayer : null);

  /** Turns plans on or off, and shows the model with them. */
  function setOn(next: string[]) {
    on = next;
    if (chosenLayer !== null && !next.includes(chosenLayer)) chosenLayer = null;
    if (text !== null) lint(text);
  }

  /** Where edits go; a plan they go into is on. */
  function setLayer(l: Layer) {
    chosenLayer = l;
    if (l !== null && !on.includes(l)) setOn([...on, l]);
  }
  let addThingDialog = $state<HTMLDialogElement>();
  let addScenarioDialog = $state<HTMLDialogElement>();
  let addPlanDialog = $state<HTMLDialogElement>();
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
        const problem = nameProblem(to, (n) => Object.hasOwn(w.things, n));
        if (problem || !apply(renameThing(from, to))) return problem || editError;
        if (selected === from) selected = to;
        if (target === from) target = to;
        const swap = (ids: Set<string>) => new Set([...ids].map((x) => (x === from ? to : x)));
        [expanded, forward] = [swap(expanded), swap(forward)];
        return '';
      },
      renameScenario: (from, to) => {
        const problem = nameProblem(to, (n) => Object.hasOwn(w.scenarios, n));
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
            scenarioName = '';
          },
        ),
    };
  });

  // An edit waiting for confirmation, with what it would change.
  interface Asking extends Question {
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
          const m = tryLoad(after, [p.name]);
          return m instanceof ReachError ? [`${p.name} would no longer load: ${m.message}`] : [];
        });
      asking = {
        title,
        text: body,
        action,
        danger: action === 'Delete',
        changes: changes(written(text, of), written(after, of)),
        verdicts: verdicts ? verdictsAfter(after) : null,
        warnings,
        edit: e,
        then,
      };
    } catch (err) {
      editError = (err as Error).message;
    }
  }

  const verdictsAfter = (after: string) => (text === null ? null : compareTexts(text, after, plans, inOrder(after)));

  function confirmed() {
    if (asking && apply(asking.edit)) asking.then();
  }

  function turn(name: string, isOn: boolean) {
    setOn(isOn ? [...on, name] : on.filter((n) => n !== name));
  }

  /** A new plan is on, and edits go into it; its tab opens on its note. */
  function addedPlan(name: string) {
    if (!apply(addPlan(name, ''))) return;
    setLayer(name);
    setEditMode(true);
    showTab('plans');
  }

  function renamePlanTo(from: string, to: string): string {
    const problem = nameProblem(to, (n) => planList.some((p) => p.name === n));
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
    showTab('scenarios');
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

  const choosing = $derived(mode === 'ways' && !target);
  const lost = $derived(mode === 'ways' && !!model && !!target && !model.things.has(target));
  const view = $derived.by(() => {
    if (!model) return null;
    if (mode === 'where') return whereView(model, scenario);
    if (mode === 'all') return waysInView(model, [...model.things.keys()], 'all', scenario);
    if (!model.things.has(target)) return null;
    return waysInView(model, [target], expanded, scenario, forward);
  });

  // ?expand=a,b opens those nodes' ways in one at a time (for headless checks).
  const demo = (q.get('expand') ?? '').split(',').filter(Boolean);
  let demoStarted = false;
  function demoStep() {
    const id = demo.shift();
    if (!id) return;
    select(id);
    setOpen(id, 'in', true);
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
    // A view that's gone stays, marked out of date, unless there's nothing chosen to show.
    if (!v) {
      if (choosing) {
        seq++;
        shown = null;
        restarting = true;
      }
      return;
    }
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
    [expanded, forward] = [expandToDepth(model, [id], DEPTH), new Set()];
    restart();
  }

  /** Selects a thing, for Details, and shows where it's defined in the text. */
  function select(id: string) {
    selected = id;
    const at = text !== null && model?.things.has(id) ? definitionOf(text, id, plans) : null;
    if (at) reveal = { from: at[0], to: at[1] };
  }

  /** Selects a node and opens it in Details: a thing's form, or a junction's details. */
  function editNode(id: string) {
    select(id);
    showTab('details');
    if (model?.things.has(id)) setEditMode(true);
  }

  /** Shows or hides a node's ways in, or what it's a way into. */
  function setOpen(id: string, side: Side, open: boolean) {
    const was = [...(side === 'in' ? expanded : forward)].filter((x) => x !== id);
    const ids = new Set(open ? [...was, id] : was);
    if (side === 'in') expanded = ids;
    else forward = ids;
  }

  const selNode = $derived(selected ? shown?.view.nodes.find((n) => n.id === selected) : undefined);

  // Why the forms are off, and where to fix it.
  const off = $derived(
    planError
      ? { why: 'The plans that are on don’t load', fix: 'Show the plans', onfix: () => showTab('plans') }
      : { why: 'The text has errors', fix: 'Show the text', onfix: () => showTab('text') },
  );

  // What the toolbar's pickers offer.
  const thingGroups = $derived.by((): PickerGroup[] => {
    const things = [...(model?.things ?? [])];
    const byName = (a: string, b: string) => a.localeCompare(b);
    return [...KINDS]
      .sort(byName)
      .map((k) => ({
        name: k,
        kind: k,
        rows: things
          .filter(([, t]) => t.kind === k)
          .map(([id]) => id)
          .sort(byName)
          .map((id) => ({ id })),
      }))
      .filter((g) => g.rows.length);
  });
  const scenarioGroups = $derived.by((): PickerGroup[] => {
    const all = [...(model?.scenarios ?? [])].map(([id, sc]) => ({ id, kind: sc.kind, summary: summary(id, sc) }));
    const PLURAL = { lockout: 'lockouts', breach: 'breaches' };
    return [
      {
        rows: [
          { id: '', label: 'none', summary: 'the graph without a scenario' },
          ...all.filter((r) => r.id === BASELINE),
        ],
      },
      ...SCENARIO_KINDS.map((k) => ({ name: PLURAL[k], rows: all.filter((r) => r.id !== BASELINE && r.kind === k) })),
    ].filter((g) => g.rows.length);
  });
  const planGroups = $derived([{ rows: planList.map((p) => ({ id: p.name, summary: p.note || undefined })) }]);

  const MODES = [
    ['ways', 'Ways in', LogIn],
    ['where', 'Where things live', MapPin],
    ['all', 'Everything', Network],
  ] as const;
  const viewing = $derived(MODES.find(([m]) => m === mode) ?? MODES[0]);
  // What the folded row says is chosen. The plan edits go into is on, and said after.
  const chosen = $derived([
    ...(mode === 'ways' && target ? [['Thing', target]] : []),
    ...(scenarioName ? [['Scenario', scenarioName]] : []),
    ...plans.filter((p) => p !== layer).map((p) => ['Plan', p]),
  ]);
</script>

<svelte:window {onkeydown} {onbeforeunload} bind:innerWidth />

<div class="app" class:open={tab !== null} style:--panel-w="{Math.min(width, maxWidth)}px">
  <header class="head">
    <Home />
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
    {#if planList.length && !phone}{@render layerField()}{/if}
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
        onclick={() => addPlanDialog?.showModal()}>Plan…</button
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

  <!--
    What the graph shows: over its top-left corner, or on phones a row of its
    own, folded to say what's chosen and where edits go (open while there's no thing chosen).
  -->
  <div class="lens shrinks wide">
    {#if phone && !choosing}
      {@const Icon = viewing[2]}
      <button
        class="quiet fold"
        aria-expanded={lensOpen}
        aria-controls="lens-tools"
        onclick={() => (lensOpen = !lensOpen)}
      >
        <Icon /><span class:visually-hidden={chosen.length > 0}>{viewing[1]}</span>
        <span class="chosen">
          {#each chosen as [what, id], i (what + id)}
            {#if i}<span class="sep" aria-hidden="true">·</span>{/if}<span class="visually-hidden">{what}</span><span
              class="mono">{id}</span
            >
          {/each}
        </span>
        {#if layer !== null}
          <span class="into"><Pencil /><span class="visually-hidden">Edits go into plan</span>{layer}</span>
        {/if}
        {#if lensOpen}<ChevronUp />{:else}<ChevronDown />{/if}
      </button>
    {/if}
    <div id="lens-tools" class="tools" class:hidden={phone && !lensOpen && !choosing}>
      <div class="segmented" role="group" aria-label="View">
        {#each MODES as [m, label, Icon] (m)}
          <button class="quiet" aria-pressed={mode === m} title={label} onclick={() => setMode(m)}
            ><Icon /><span class="wide-only">{label}</span></button
          >
        {/each}
      </div>
      {#if mode === 'ways'}
        <Picker
          label="Thing"
          groups={thingGroups}
          chosen={[target]}
          filter
          onchoose={(id: string) => {
            waysInto(id);
            select(id);
          }}
        />
      {/if}
      <Picker
        label="Scenario"
        groups={scenarioGroups}
        chosen={[scenarioName]}
        onchoose={(name: string) => (scenarioName = name)}
      />
      {#if planList.length}
        <Picker label="Plans" groups={planGroups} chosen={plans} multiple onchoose={turn} />
      {/if}
      {#if planList.length && phone}{@render layerField()}{/if}
    </div>
    {#if shown && (invalid || lost)}
      <p class="notice badge" role="status">
        Out of date: {invalid
          ? planError
            ? 'the plans that are on don’t load'
            : 'the text has errors'
          : `${target} is no longer in the model`}
      </p>
    {/if}
  </div>

  <!--
    Closed, a strip of icons over the graph's top-right corner; open, the
    panel's first row, as wide as it, giving their words up to fit it. One
    element either way, so the button pressed keeps the focus.
  -->
  <div class="tabs" class:shrinks={tab !== null}>
    <div class="segmented" role="group" aria-label="Panel">
      {#each TABS as [t, label, Icon] (t)}
        <button
          class="quiet"
          aria-pressed={tab === t}
          aria-controls="panel"
          title={label}
          onclick={() => showTab(tab === t ? null : t)}
          ><Icon /><span class:wide-only={tab !== null} class:visually-hidden={tab === null}>{label}</span></button
        >
      {/each}
    </div>
  </div>

  <main class="canvas" class:outdated={shown && (invalid || lost)}>
    {#if shown}
      <FlowView
        view={shown.view}
        placed={shown.placed}
        {vertical}
        kind={scenario?.sc.kind ?? ''}
        {selected}
        {fitKey}
        cover={tab !== null && !phone ? Math.min(width, maxWidth) : 0}
        onnode={select}
        onedit={editNode}
        onopen={mode === 'ways' ? setOpen : undefined}
        ondeselect={() => (selected = null)}
      >
        {#snippet tools()}
          {#if mode === 'ways'}
            <button class="quiet" onclick={() => waysInto(target)} title="Back to the first steps into {target}"
              ><RotateCcw /><span class="wide-only">Reset</span></button
            >
          {/if}
          <button class="quiet" onclick={tidy} title="Lay the whole graph out again"
            ><WandSparkles /><span class="wide-only">Tidy</span></button
          >
          <LayoutMenu
            bind:direction
            bind:routing
            bind:placement
            onrestart={restart}
            ontidy={tidy}
            stats={shown
              ? { nodes: shown.view.nodes.length, edges: shown.view.edges.length, ms: shown.placed.ms }
              : undefined}
          />
          <Legend />
        {/snippet}
      </FlowView>
    {:else}
      <p class="status" role={error ? 'alert' : 'status'}>
        {error ||
          (model?.things.size === 0
            ? 'This model has no things yet.'
            : model && choosing
              ? 'Choose a thing to see the ways into it.'
              : 'Loading…')}
      </p>
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
        onopen={setOpen}
        edit={editMode}
        {editing}
        onedit={setEditMode}
        {off}
      />
    {/if}
    {#if tab === 'scenarios'}
      <Scenarios {model} {scenario} {scenarioName} edit={editMode} {editing} onedit={setEditMode} {off} />
    {/if}
    {#if editorOpened && editorModule && text !== null}
      <section class="tab text" class:hidden={tab !== 'text'} aria-label="Model text">
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
            definition={(id: string) => {
              const at = definitionOf(text ?? '', id, plans);
              return at && { from: at[0], to: at[1] };
            }}
            error={formatError}
          >
            {#snippet tools()}
              <button
                class="quiet"
                onclick={formatText}
                title="Lay the text out the way guided edits do, without comments"
                ><TextAlignStart /><span class="wide-only">Format</span></button
              >
            {/snippet}
          </Editor>
        {:catch e}
          <p class="status">The editor didn't load: {message(e)}</p>
        {/await}
      </section>
    {/if}
    {#if tab === 'plans'}
      <Plans
        plans={planList.filter((p) => plans.includes(p.name))}
        any={planList.length > 0}
        overlaps={text === null ? [] : overlaps(text, plans)}
        {comparison}
        editable={!!editing}
        error={planError}
        edit={editMode}
        onedit={setEditMode}
        {off}
        onapply={applyPlanNamed}
        ondelete={deletePlanNamed}
        onrename={renamePlanTo}
        onnote={(name: string, note: string) => apply(setPlanNote(name, note))}
      />
    {/if}
    {#if tab === 'history' && text !== null}
      <section class="tab" aria-label="History">
        {#await import('../panel/History.svelte') then { default: History }}
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
  example="mail_pw"
  kinds={KINDS}
  taken={(n: string) => !!editing?.ids.has(n)}
  onadd={(n: string, k: string) => added(n, k)}
/>
<AddDialog
  bind:dialog={addScenarioDialog}
  title="Add a scenario"
  example="house_fire"
  kinds={SCENARIO_KINDS}
  taken={(n: string) => !!editing && Object.hasOwn(editing.written.scenarios, n)}
  onadd={(n: string, k: string) => addedScenario(n, k)}
/>
<AddDialog
  bind:dialog={addPlanDialog}
  title="Add a plan"
  example="spare_key"
  taken={(n: string) => planList.some((p) => p.name === n)}
  onadd={(n: string) => addedPlan(n)}
/>
<TemplateDialog
  bind:dialog={templateDialog}
  ids={editing?.ids ?? new Map<string, string>()}
  preview={previewTemplate}
  onadd={(t: Template, prefix: string, things: Things, asPlan: boolean) => addedTemplate(t, prefix, things, asPlan)}
/>
<ConfirmEdit {asking} onconfirm={confirmed} onclose={() => (asking = null)} />

<!-- Add and every form write here, so it shows whenever there's a choice: in the header, or on phones the folded row. -->
{#snippet layerField()}
  <label class="field inline"
    >Edits go into
    <select value={layer ?? ''} onchange={(e) => setLayer(e.currentTarget.value || null)} class:plan={layer !== null}>
      <option value="">the model</option>
      {#each planList as p (p.name)}<option value={p.name}>plan {p.name}</option>{/each}
    </select>
  </label>
{/snippet}

<style>
  /*
   * The document's header across the top, and under it the graph, with what
   * it shows floating over it. Open, the panel is beside it, under its tabs
   * (on phones, in its place); closed, the tabs float over the graph too.
   */
  .app {
    display: grid;
    grid-template:
      'head' auto
      'banner' auto
      'canvas' minmax(0, 1fr)
      / minmax(0, 1fr);
    height: 100%;
  }
  .app.open {
    grid-template:
      'head head' auto
      'banner banner' auto
      'canvas tabs' auto
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
  .state {
    font-size: var(--text-sm);
    white-space: nowrap;
  }
  .spacer {
    flex: 1;
  }
  select.plan {
    border-color: var(--accent);
    color: var(--accent);
  }
  .banner {
    grid-area: banner;
    padding: var(--space-2) var(--space-3);
    border-bottom: 1px solid var(--border);
  }
  /* Across the graph's top, letting clicks through to it around the bar. */
  .lens {
    grid-area: canvas;
    z-index: 5;
    align-self: start;
    display: grid;
    justify-items: start;
    gap: var(--space-2);
    min-width: 0;
    padding: var(--space-2);
    pointer-events: none;
  }
  /* Room for the tabs beside it, at the right, while they float too. */
  .app:not(.open) .lens {
    padding-right: 13rem;
  }
  .tools {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2) var(--space-3);
    max-width: 100%;
    padding: var(--space-1);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
    box-shadow: var(--shadow);
    pointer-events: auto;
  }
  .tools .segmented {
    padding: 0;
    border: none;
  }
  /* On phones, the toolbar folded: what's chosen, giving way at its end, and where edits go. */
  .fold {
    justify-self: stretch;
    justify-content: flex-start;
    min-width: 0;
    padding: 0 var(--space-2);
  }
  .chosen {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .sep {
    margin-inline: 0.5ch;
  }
  .into {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    color: var(--accent);
    font-family: var(--code-font);
  }
  .fold > :global(.lucide:last-child) {
    margin-left: auto;
  }
  .tabs {
    grid-area: tabs;
    min-width: 0;
    padding: var(--space-2) var(--space-3);
    border-bottom: 1px solid var(--border);
    background: var(--surface);
  }
  /* Open, the tabs fill the panel's width. */
  .tabs .segmented {
    display: flex;
    width: 100%;
  }
  .tabs button {
    flex: 1 1 auto;
  }
  .app:not(.open) .tabs {
    grid-area: canvas;
    z-index: 5;
    align-self: start;
    justify-self: end;
    margin: var(--space-2);
    padding: 0;
    border: none;
    background: none;
  }
  /* As tall as the toolbar beside it, whose controls are 6px taller than these buttons. */
  .app:not(.open) .tabs .segmented {
    width: auto;
    padding: calc(var(--space-1) + 3px);
    box-shadow: var(--shadow);
  }
  .canvas {
    grid-area: canvas;
    position: relative;
    min-width: 0;
    min-height: 0;
  }
  /* Clear of the toolbar over the graph's top. */
  .canvas > .status {
    padding-top: 5rem;
    text-align: center;
  }
  .outdated :global(.svelte-flow__viewport) {
    opacity: 0.4;
  }
  .badge {
    max-width: 100%;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .panel {
    grid-area: panel;
    position: relative;
    min-width: 0;
    min-height: 0;
    background: var(--surface);
  }
  .tab {
    height: 100%;
  }
  .hidden {
    display: none;
  }

  /*
   * Wide, the open panel is a card floating over the graph's right side, its
   * tabs the card's first row, where they float when it's closed. The card's
   * surface and shadow are drawn behind both, so no shadow falls across the
   * seam between them.
   */
  @media (min-width: 761px) {
    .app.open::before,
    .app.open .tabs,
    .app.open .panel {
      position: relative;
      z-index: 1;
    }
    .app.open::before {
      content: '';
      grid-column: 2;
      grid-row: tabs-start / panel-end;
      margin: var(--space-2);
      border-radius: var(--radius-lg);
      background: var(--surface);
      box-shadow: var(--shadow);
    }
    .app.open .tabs {
      margin: var(--space-2) var(--space-2) 0;
      padding: 0;
      border: 1px solid var(--border);
      border-radius: var(--radius-lg) var(--radius-lg) 0 0;
      background: none;
    }
    .app.open .tabs .segmented {
      padding: calc(var(--space-1) + 3px);
      border: none;
      background: none;
    }
    .app.open .panel {
      margin: 0 var(--space-2) var(--space-2);
      border: 1px solid var(--border);
      border-top: none;
      border-radius: 0 0 var(--radius-lg) var(--radius-lg);
      background: none;
    }
    /* What fills the card, rounded at its foot to fit. */
    .app.open .panel > :global(*) {
      border-bottom-right-radius: calc(var(--radius-lg) - 1px);
      border-bottom-left-radius: calc(var(--radius-lg) - 1px);
    }
    .app.open .tab {
      overflow: hidden;
    }
    /* The graph runs on under the card. */
    .app.open .canvas {
      grid-column: 1 / -1;
    }
    .app.open .canvas > .status {
      padding-right: var(--panel-w);
    }
  }

  /* Phones: the panel, open, covers the graph. */
  @media (max-width: 760px) {
    .head {
      flex-wrap: wrap;
    }
    /* The model's name gives way, so the header's buttons stay on one row. */
    .head > :global(h1) {
      flex: 1 1 0;
    }
    .spacer {
      display: none;
    }
    .app {
      grid-template:
        'head' auto
        'banner' auto
        'lens' auto
        'canvas' minmax(0, 1fr)
        / minmax(0, 1fr);
    }
    .app.open {
      grid-template:
        'head' auto
        'banner' auto
        'lens' auto
        'tabs' auto
        'panel' minmax(0, 1fr)
        / minmax(0, 1fr);
    }
    .app.open .canvas {
      display: none;
    }
    /* What the graph shows is a row of its own, and so are the tabs while the panel's open, as its header. */
    .lens,
    .app:not(.open) .lens {
      grid-area: lens;
      padding: var(--space-2) var(--space-3);
      border-bottom: 1px solid var(--border);
      background: var(--surface);
      pointer-events: auto;
    }
    .tools {
      padding: 0;
      border: none;
      box-shadow: none;
    }
    .panel :global(.resizer) {
      display: none;
    }
  }
</style>
