<script lang="ts">
  // The panel's Details tab: the thing selected in the graph (in edit mode,
  // its form), and its status in the scenario.
  import { fmtWhy } from '../../../engine/model.ts';
  import { isJunction, type VNode } from '../graph/build';
  import type { Model, Outcome } from '../lib/data';
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
    oncollapse: (id: string) => void;
    /** Whether the forms are showing. */
    edit: boolean;
    /** Null while the text doesn't load. */
    editing: Editing | null;
    onedit: (on: boolean) => void;
    off: Off;
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

  const junction = $derived(node && isJunction(node.kind) ? node : undefined);
  const thing = $derived(selected && !junction ? model?.things.get(selected) : undefined);
  const reach = $derived(selected ? scenario?.best.get(selected) : undefined);
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
    {#if scenario !== undefined || target !== selected || (node?.expanded && !node.root)}
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
      </section>
    {/if}
  {:else if edit}
    <section><p class="muted">Select a node to edit it, or add a thing from Add.</p></section>
  {:else}
    <section>
      <p class="muted">
        Select a node for its details. A <b>+</b> on a node means it has more ways in; selecting it shows them.
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
