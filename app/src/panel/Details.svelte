<script lang="ts">
  // The panel's Details tab: the thing selected in the graph, and its status
  // in the scenario. In edit mode, its form.
  import { fmtWhy } from '../../../engine/model.ts';
  import { isJunction, type VNode } from '../graph/build';
  import type { Model, Outcome } from '../lib/data';
  import type { Created, Editing } from '../lib/edit';
  import EditBar from '../forms/EditBar.svelte';
  import FromPlan from '../forms/FromPlan.svelte';
  import ThingForm from '../forms/ThingForm.svelte';

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
    oncollapse: (id: string) => void;
    /** Whether the forms are showing. */
    edit: boolean;
    /** Null while the text doesn't load. */
    editing: Editing | null;
    onedit: (on: boolean) => void;
    /** Why the forms are off while editing is null, and what fixes it. */
    off: { why: string; fix: string; onfix: () => void };
  }
  let {
    model,
    scenario,
    scenarioName,
    selected,
    node,
    target,
    onwaysinto,
    oncollapse,
    edit,
    editing,
    onedit,
    off,
  }: Props = $props();

  const thingSpec = $derived(selected ? editing?.written.things[selected] : undefined);

  const thing = $derived(selected ? model?.things.get(selected) : undefined);
  const reach = $derived(selected ? scenario?.best.get(selected) : undefined);
</script>

<div class="details">
  <div class="mode" class:beside={!edit}>
    <EditBar {edit} {editing} {onedit} />
  </div>
  {#if edit && !editing}
    <p class="notice" role="status">
      {off.why}, so the forms are off until that's fixed. <button onclick={off.onfix}>{off.fix}</button>
    </p>
  {/if}

  <section>
    {#if node && isJunction(node.kind)}
      <h2>{node.label} junction</h2>
      <p class="muted mono">{node.id}</p>
    {:else if edit && editing && selected && thingSpec}
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
    {:else if thing && selected}
      <h2>{selected} <span class="muted">{thing.kind}</span></h2>
      {#if thing.check.length}<p class="muted">Checked for {thing.check.map((c) => `${c}s`).join(' and ')}</p>{/if}
      {#if thing.note}<p>{thing.note}</p>{/if}
      {#if thing.todo}<p class="todo">To do: {thing.todo}</p>{/if}
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
      {#if target !== selected || (node?.expanded && !node.root)}
        <div class="actions">
          {#if target !== selected}
            <button onclick={() => onwaysinto(selected)}>Ways into this</button>
          {/if}
          {#if target !== null && node?.expanded && !node.root}
            <button class="quiet" onclick={() => oncollapse(selected)}>Collapse</button>
          {/if}
        </div>
      {/if}
    {:else if edit}
      <p class="muted">Select a node to edit it, or add a thing from Add.</p>
    {:else}
      <p class="muted">
        Select a node for its details. A <b>+</b> on a node means it has more ways in; selecting it shows them.
      </p>
    {/if}
  </section>
</div>

<style>
  .details {
    display: grid;
    align-content: start;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: var(--space-4);
    height: 100%;
    overflow-y: auto;
    padding: var(--space-4);
  }
  .details > * {
    grid-column: 1 / -1;
  }
  .mode {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: var(--space-2);
    margin: calc(-1 * var(--space-2)) 0 calc(-1 * var(--space-2));
  }
  /* Out of edit mode it's the button alone, so it sits beside the first heading. */
  .mode.beside {
    grid-area: 1 / 2;
    align-self: start;
  }
  .mode.beside + * {
    grid-area: 1 / 1;
  }
  section {
    display: grid;
    gap: var(--space-2);
  }
  h2 {
    font-size: var(--text-md);
    overflow-wrap: anywhere;
  }
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
