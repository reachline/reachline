<script lang="ts">
  // The panel's Details tab: the thing selected in the graph (in edit mode,
  // its form), and its status in the scenario.
  import { fmtWhy } from '../../../engine/model.ts';
  import { isJunction, type Outcome, type VNode } from '../../../engine/view.ts';
  import type { Side } from '../graph/nodes';
  import type { Model } from '../lib/data';
  import type { Created, Editing, Off } from '../lib/edit';
  import FromPlan from '../forms/FromPlan.svelte';
  import ThingForm from '../forms/ThingForm.svelte';
  import Pane from './Pane.svelte';

  interface Props {
    model: Model | null;
    scenario: Outcome | undefined;
    scenarioName: string;
    selected: string | null;
    /** The selected node, while it's in the graph. */
    node: VNode | undefined;
    /** The thing whose ways in are shown, if that's the view. */
    target: string | null;
    onwaysinto: (id: string) => void;
    /** Shows or hides the node's ways in, or what it's a way into. */
    onopen: (id: string, side: Side, open: boolean) => void;
    /** Whether the forms are showing. */
    edit: boolean;
    /** Null while the text doesn't load. */
    editing: Editing | null;
    onedit: (on: boolean) => void;
    off: Off;
  }
  let { model, scenario, scenarioName, selected, node, target, onwaysinto, onopen, edit, editing, onedit, off }: Props =
    $props();

  const thingSpec = $derived(selected ? editing?.written.things[selected] : undefined);

  const junction = $derived(node && isJunction(node.kind) ? node : undefined);
  const thing = $derived(selected && !junction ? model?.things.get(selected) : undefined);
  const reach = $derived(selected ? scenario?.best.get(selected) : undefined);

  // What the node can show or hide, in the ways-in view. The arrows on its sides do the same.
  const toggles = $derived.by(() => {
    if (target === null || !node) return [];
    const all: [Side, boolean, string, boolean | undefined][] = [
      ['in', true, 'Show ways in', node.more],
      ['in', false, 'Hide ways in', node.expanded],
      ['out', true, 'Show what it leads to', node.moreOut],
      ['out', false, 'Hide what it leads to', node.expandedOut],
    ];
    return all.filter(([, , , on]) => on);
  });
</script>

<Pane
  name={junction ? junction.label : thing ? selected! : undefined}
  kind={junction ? 'junction' : thing?.kind}
  {edit}
  editable={!!editing}
  {onedit}
  {off}
>
  {#if junction}
    <section><p class="muted mono">{junction.id}</p></section>
  {:else if thing && selected}
    <section>
      {#if edit && editing && thingSpec}
        <FromPlan {editing} section="things" id={selected} />
        {#key selected}
          <ThingForm
            id={selected}
            spec={thingSpec}
            ids={editing.ids}
            onset={(field: string, value: unknown, created?: Created[]) =>
              editing.setThing(selected, field, value, created)}
            onrename={(to: string) => editing.renameThing(selected, to)}
            ondelete={() => editing.deleteThing(selected)}
          />
        {/key}
      {:else}
        {#if thing.check.length}<p class="muted">Checked for {thing.check.map((c) => `${c}s`).join(' and ')}</p>{/if}
        {#if thing.note}<p>{thing.note}</p>{/if}
        {#if thing.todo}<p class="todo">To do: {thing.todo}</p>{/if}
      {/if}
    </section>
    {#if scenario !== undefined || target !== selected || toggles.length}
      <section aria-label="In the scenario">
        {#if scenario}
          {#if !scenario.avail.get(selected)}
            <p><b>Gone</b> in {scenarioName}.</p>
          {:else if reach}
            <p><b>Reached</b> in {scenarioName}{reach.a.length ? ` if ${reach.a.join(', ')}` : ' outright'}</p>
            <p class="mono">via {fmtWhy(reach.why)}</p>
          {:else}
            <p><b>Not reached</b> in {scenarioName}.</p>
          {/if}
          {#if scenario.rows.has(selected)}<p class="row">{scenario.rows.get(selected)![0]}</p>{/if}
        {/if}
        {#if target !== selected || toggles.length}
          <div class="actions">
            {#if target !== selected}
              <button onclick={() => onwaysinto(selected)}>Ways into this</button>
            {/if}
            {#each toggles as [side, open, label] (label)}
              <button class="quiet" onclick={() => onopen(selected, side, open)}>{label}</button>
            {/each}
          </div>
        {/if}
      </section>
    {/if}
  {:else if edit}
    <section><p class="muted">Select a node to edit it, or add a thing from Add.</p></section>
  {:else}
    <section>
      <p class="muted">
        Select a node for its details, or double-click it to edit it. A chevron beside a node means there’s more that
        side; selected, a node also has chevrons that hide what’s shown.
      </p>
    </section>
  {/if}
</Pane>

<style>
  .todo {
    color: var(--warning);
  }
  .row {
    color: var(--danger);
    font-weight: 600;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
</style>
