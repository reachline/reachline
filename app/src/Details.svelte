<script lang="ts">
  // The panel's Details tab: the scenario, and the thing selected in the graph.
  // In edit mode, forms for both.
  import { Check, Pencil, X } from '@lucide/svelte';
  import { fmtWhy } from '../../engine/model.ts';
  import { what } from '../../engine/report.ts';
  import { isJunction, type VNode } from './build';
  import type { Model, Outcome } from './data';
  import type { Created, Editing } from './edit';
  import ScenarioForm from './ScenarioForm.svelte';
  import ThingForm from './ThingForm.svelte';

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
    /** Shows the text, to fix what keeps the forms off. */
    ontext: () => void;
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
    ontext,
  }: Props = $props();

  const states = $derived([...(editing?.ids ?? [])].filter(([, k]) => k === 'state').map(([id]) => id));
  const scenarioSpec = $derived(editing?.written.scenarios[scenarioName]);
  const thingSpec = $derived(selected ? editing?.written.things[selected] : undefined);

  const thing = $derived(selected ? model?.things.get(selected) : undefined);
  const reach = $derived(selected ? scenario?.best.get(selected) : undefined);
</script>

<div class="details">
  <div class="mode" class:beside={!edit}>
    {#if edit && editing?.plans.length}
      <label class="field inline"
        >Edits go into
        <select
          value={editing.layer ?? ''}
          onchange={(e) => editing.setLayer(e.currentTarget.value || null)}
          class:plan={editing.layer !== null}
        >
          <option value="">the model</option>
          {#each editing.plans as p (p)}<option value={p}>plan {p}</option>{/each}
        </select>
      </label>
    {/if}
    <!-- Done keeps the edits, like every edit along the way; it isn't a cancel. -->
    <button class:quiet={!edit} onclick={() => onedit(!edit)}>
      {#if edit}<Check />Done{:else}<Pencil />Edit{/if}
    </button>
  </div>
  {#if edit && !editing}
    <p class="notice" role="status">
      The text has errors, so the forms are off until they're fixed. <button onclick={ontext}>Show the text</button>
    </p>
  {/if}
  {#if edit && editing}
    <datalist id="thing-ids">
      {#each [...editing.ids.keys()] as id (id)}<option value={id}></option>{/each}
    </datalist>
    <datalist id="state-ids">
      {#each states as id (id)}<option value={id}></option>{/each}
    </datalist>
  {/if}

  <!-- In a plan: what it adds, or the fields it sets, each of which can go back to the model's. -->
  {#snippet fromPlan(section: 'things' | 'scenarios', id: string)}
    {#if editing?.layer}
      {@const sets = editing.sets(section, id)}
      {#if !editing.inModel(section, id)}
        <p class="muted">Added by plan {editing.layer}.</p>
      {:else if sets.length}
        <div class="sets">
          <span class="muted">Plan {editing.layer} sets</span>
          <ul class="chips">
            {#each sets as f (f)}
              <li class="chip">
                {f}<button
                  class="quiet icon"
                  aria-label={`Use the model's ${f}`}
                  title="Use the model's"
                  onclick={() => editing.revert(section, id, f)}><X /></button
                >
              </li>
            {/each}
          </ul>
        </div>
      {/if}
    {/if}
  {/snippet}

  <!-- What the scenario is. While editing it follows the thing, which is what's being worked on. -->
  {#snippet scenarioPart()}
    {#if edit && editing && scenarioSpec}
      <section aria-label="Scenario">
        {@render fromPlan('scenarios', scenarioName)}
        {#key scenarioName}
          <ScenarioForm
            name={scenarioName}
            spec={scenarioSpec}
            me={editing.written.me}
            ids={editing.ids}
            onset={(field: string, value: unknown, created?: Created[]) =>
              editing.setScenario(scenarioName, field, value, created)}
            onme={editing.setMe}
            onrename={(to: string) => editing.renameScenario(scenarioName, to)}
            ondelete={() => editing.deleteScenario(scenarioName)}
          />
        {/key}
      </section>
    {:else if scenario}
      <section>
        <h2>{scenarioName} <span class="muted">{scenario.sc.kind}</span></h2>
        <p class="muted">{what(scenario.sc)}</p>
        {#if scenario.sc.note}<p>{scenario.sc.note}</p>{/if}
      </section>
    {/if}
  {/snippet}

  {#if !edit}{@render scenarioPart()}{/if}

  <section>
    {#if node && isJunction(node.kind)}
      <h2>{node.label} junction</h2>
      <p class="muted mono">{node.id}</p>
    {:else if edit && editing && selected && thingSpec}
      {@render fromPlan('things', selected)}
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
    {:else if edit}
      <p class="muted">Select a node to edit it, or add a thing from Add.</p>
    {:else}
      <p class="muted">
        Select a node for its details. A <b>+</b> on a node means it has more ways in; selecting it shows them.
      </p>
    {/if}
  </section>

  {#if edit}{@render scenarioPart()}{/if}
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
  select.plan {
    border-color: var(--accent);
    color: var(--accent);
  }
  .sets {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
  }
  datalist {
    display: none;
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
