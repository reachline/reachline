<script lang="ts">
  // What the graph shows: the view, the thing whose ways in it shows, the
  // scenario and the plans that are on. Over the graph's top-left corner, or
  // on phones a row of its own, folded to say what's chosen and where edits
  // go (open while there's no thing chosen). Where it sits is App's to say.
  import { ChevronDown, ChevronUp, LogIn, MapPin, Network, Pencil } from '@lucide/svelte';
  import { BASELINE, KINDS, SCENARIO_KINDS } from '../../../engine/model.ts';
  import { summary, type Model } from '../lib/data';
  import { keep, load } from '../lib/prefs';
  import LayerPicker from '../shell/LayerPicker.svelte';
  import Picker, { type PickerGroup } from '../shell/Picker.svelte';
  import type { Mode } from './nodes';

  interface Props {
    model: Model | null;
    mode: Mode;
    /** The thing whose ways in are shown. */
    target: string;
    scenario: string;
    /** Every plan in the document, and the names of those that are on. */
    planList: { name: string; note: string }[];
    plans: string[];
    /** The plan edits go into; none, and they go into the model. */
    layer: string | null;
    phone: boolean;
    /** Why what's shown is out of date, if it is. */
    outdated: string;
    onmode: (mode: Mode) => void;
    onthing: (id: string) => void;
    onscenario: (name: string) => void;
    onplan: (name: string, on: boolean) => void;
    onlayer: (layer: string | null) => void;
  }
  let {
    model,
    mode,
    target,
    scenario,
    planList,
    plans,
    layer,
    phone,
    outdated,
    onmode,
    onthing,
    onscenario,
    onplan,
    onlayer,
  }: Props = $props();

  // Folded on phones, open or not as this device last had it.
  let open = $state(load('lens.open') === true);
  $effect(() => keep('lens.open', open));

  const MODES = [
    ['ways', 'Ways in', LogIn],
    ['where', 'Where things live', MapPin],
    ['all', 'Everything', Network],
  ] as const;
  const viewing = $derived(MODES.find(([m]) => m === mode) ?? MODES[0]);
  const choosing = $derived(mode === 'ways' && !target);
  // What the folded row says is chosen. The plan edits go into is on, and said after.
  const chosen = $derived([
    ...(mode === 'ways' && target ? [['Thing', target]] : []),
    ...(scenario ? [['Scenario', scenario]] : []),
    ...plans.filter((p) => p !== layer).map((p) => ['Plan', p]),
  ]);

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
</script>

<div class="lens shrinks wide">
  {#if phone && !choosing}
    {@const Icon = viewing[2]}
    <button class="quiet fold" aria-expanded={open} aria-controls="lens-tools" onclick={() => (open = !open)}>
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
      {#if open}<ChevronUp />{:else}<ChevronDown />{/if}
    </button>
  {/if}
  <div id="lens-tools" class="tools floating" class:hidden={phone && !open && !choosing}>
    <div class="segmented" role="group" aria-label="View">
      {#each MODES as [m, label, Icon] (m)}
        <button class="quiet" aria-pressed={mode === m} title={label} onclick={() => onmode(m)}
          ><Icon /><span class="wide-only">{label}</span></button
        >
      {/each}
    </div>
    {#if mode === 'ways'}
      <Picker label="Thing" groups={thingGroups} chosen={[target]} filter onchoose={(id: string) => onthing(id)} />
    {/if}
    <Picker
      label="Scenario"
      groups={scenarioGroups}
      chosen={[scenario]}
      onchoose={(name: string) => onscenario(name)}
    />
    {#if planList.length}
      <Picker label="Plans" groups={planGroups} chosen={plans} multiple onchoose={onplan} />
    {/if}
    {#if planList.length && phone}<LayerPicker plans={planList} {layer} onchoose={onlayer} />{/if}
  </div>
  {#if outdated}
    <p class="notice badge" role="status">Out of date: {outdated}</p>
  {/if}
</div>

<style>
  /* Letting clicks through to the graph around the bar. */
  .lens {
    display: grid;
    justify-items: start;
    gap: var(--space-2);
    min-width: 0;
    padding: var(--space-2);
    pointer-events: none;
  }
  .tools {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2) var(--space-3);
    max-width: 100%;
    padding: var(--space-1);
    pointer-events: auto;
  }
  .tools .segmented {
    padding: 0;
    border: none;
  }
  .hidden {
    display: none;
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
  .badge {
    max-width: 100%;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  /* Phones: a row of its own, across the top. */
  @media (max-width: 760px) {
    .lens {
      padding: var(--space-2) var(--space-3);
      border-bottom: 1px solid var(--border);
      background: var(--surface);
      pointer-events: auto;
    }
    .tools {
      padding: 0;
      border: none;
      border-radius: 0;
      box-shadow: none;
    }
  }
</style>
