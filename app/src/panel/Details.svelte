<script lang="ts">
  // The panel's Details tab: the thing selected in the graph (in edit mode,
  // its form), and its status in the scenario.
  import { fmtCond } from '../../../engine/cond.ts';
  import { fmtWhy } from '../../../engine/model.ts';
  import { isJunction, type Outcome, type VNode } from '../../../engine/view.ts';
  import { plural } from '../graph/nodes';
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
    /** Whether the forms are showing. */
    edit: boolean;
    /** Null while the text doesn't load. */
    editing: Editing | null;
    onedit: (on: boolean) => void;
    off: Off;
  }
  let { model, scenario, scenarioName, selected, node, target, onwaysinto, edit, editing, onedit, off }: Props =
    $props();

  const thingSpec = $derived(selected ? editing?.written.things[selected] : undefined);

  const junction = $derived(node && isJunction(node.kind) ? node : undefined);
  const thing = $derived(selected && !junction ? model?.things.get(selected) : undefined);
  const reach = $derived(selected ? scenario?.best.get(selected) : undefined);

  // The thing as it stands, under the form's labels and in its order, so editing changes what's here.
  const fields = $derived.by(() => {
    if (!thing) return [];
    const cond = (c: typeof thing.access) => c && fmtCond(c);
    const text = (v: unknown) => (typeof v === 'string' && v ? v : null);
    const all: [string, string | null, boolean][] = [
      ['Check for', thing.check.map(plural).join(' and ') || null, false],
      ['Note', text(thing.note), false],
      ['To do', text(thing.todo), false],
      ['Lives in', thing.in.join(', ') || null, true],
      ['Accessed with', cond(thing.access), true],
      ['Recovered with', cond(thing.recovery), true],
      ['Locked with', cond(thing.lock), true],
      ['Needs', cond(thing.needs), true],
    ];
    return all.filter((f): f is [string, string, boolean] => f[1] !== null);
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
      {:else if fields.length || thing.mirrors}
        <dl>
          {#each fields as [label, value, ids] (label)}
            <div>
              <dt>{label}</dt>
              <dd class:mono={ids} class:todo={label === 'To do'}>{value}</dd>
            </div>
          {/each}
          {#if thing.mirrors}
            <div>
              <dt>Mirrors</dt>
              <dd>
                A copy of <span class="mono">{thing.mirrors.of}</span>, synced by
                <span class="mono">{thing.mirrors.by}</span>.
              </dd>
            </div>
          {/if}
        </dl>
      {:else}
        <p class="muted">Nothing more is written about it.</p>
      {/if}
    </section>
    {#if scenario !== undefined || target !== selected}
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
        {#if target !== selected}
          <div><button onclick={() => onwaysinto(selected)}>Ways into this</button></div>
        {/if}
      </section>
    {/if}
  {:else if edit}
    <section><p class="muted">Select a node to edit it, or add a thing from Add.</p></section>
  {:else}
    <section>
      <p class="muted">
        Select a node for its details, or double-click it to edit it. A chevron beside a node means there’s more that
        side; selected, a node also has chevrons that hide what’s shown. With a node focused, the arrow keys do the
        same.
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
  dl {
    display: grid;
    gap: var(--space-3);
  }
  dt {
    font-weight: 500;
  }
  dd {
    overflow-wrap: anywhere;
  }
</style>
