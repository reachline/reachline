<script lang="ts">
  // The panel's Details tab: the scenario, and the thing selected in the graph.
  import { fmtWhy } from '../../engine/model.ts';
  import { what } from '../../engine/report.ts';
  import { isJunction, type VNode } from './build';
  import type { Model, Outcome } from './data';

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
  }
  let { model, scenario, scenarioName, selected, node, target, onwaysinto, oncollapse }: Props = $props();

  const thing = $derived(selected ? model?.things.get(selected) : undefined);
  const reach = $derived(selected ? scenario?.best.get(selected) : undefined);
</script>

<div class="details">
  {#if scenario}
    <section>
      <h2>{scenarioName} <span class="muted">{scenario.sc.kind}</span></h2>
      <p class="muted">{what(scenario.sc)}</p>
      {#if scenario.sc.note}<p>{scenario.sc.note}</p>{/if}
    </section>
  {/if}

  <section>
    {#if node && isJunction(node.kind)}
      <h2>{node.label} junction</h2>
      <p class="muted mono">{node.id}</p>
    {:else if thing && selected}
      <h2>{selected} <span class="muted">{thing.kind}</span></h2>
      {#if thing.tags.length}<p class="muted">{thing.tags.join(', ')}</p>{/if}
      {#if thing.note}<p>{thing.note}</p>{/if}
      {#if thing.todo}<p class="todo">To do: {thing.todo}</p>{/if}
      {#if scenario}
        {#if !scenario.avail.get(selected)}
          <p><b>Gone</b> in this scenario.</p>
        {:else if reach}
          <p><b>Reached</b>{reach.a.length ? ` if ${reach.a.join(', ')}` : ' outright'}</p>
          <p class="mono">via {fmtWhy(reach.why)}</p>
        {:else}
          <p><b>Not reached.</b></p>
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
    gap: var(--space-4);
    height: 100%;
    overflow-y: auto;
    padding: var(--space-4);
  }
  section {
    display: grid;
    gap: var(--space-2);
  }
  section + section {
    padding-top: var(--space-4);
    border-top: 1px solid var(--border);
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
