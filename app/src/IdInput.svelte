<script lang="ts">
  // A field to add an id, suggested from the model. An id that isn't a thing
  // yet can be created on the spot, with its kind.
  import { Plus } from '@lucide/svelte';
  import { UNKNOWN } from '../../engine/cond.ts';
  import { idProblem, type Created } from './edit';
  import NewThings from './NewThings.svelte';

  interface Props {
    /** The field's accessible name. */
    label: string;
    placeholder?: string;
    /** Every thing, id to kind. */
    ids: Map<string, string>;
    /** Takes states only. */
    states?: boolean;
    /** Takes `unknown` too, as a place you don't know. */
    unknown?: boolean;
    onadd: (id: string, created: Created[]) => void;
  }
  let { label, placeholder = 'Add…', ids, states = false, unknown = false, onadd }: Props = $props();

  const uid = $props.id();
  let value = $state('');
  let problem = $state('');
  // An id to create before adding, waiting for its kind.
  let missing = $state<string | null>(null);

  function submit(e: SubmitEvent) {
    e.preventDefault();
    problem = '';
    missing = null;
    const id = value.trim();
    if (!id) return;
    if (ids.has(id) || (unknown && id === UNKNOWN)) {
      if (states && ids.get(id) !== 'state') problem = `${id} isn't a state.`;
      else add(id, []);
      return;
    }
    const bad = idProblem(id);
    if (bad) problem = `${id} isn't a thing, and can't be one. ${bad}`;
    else missing = id;
  }

  function add(id: string, created: Created[]) {
    onadd(id, created);
    value = '';
    missing = null;
  }
</script>

<form class="add" onsubmit={submit}>
  <input
    list={states ? 'state-ids' : 'thing-ids'}
    aria-label={label}
    {placeholder}
    bind:value
    autocomplete="off"
    autocapitalize="off"
    spellcheck="false"
    aria-invalid={problem ? 'true' : undefined}
    aria-describedby={problem ? `${uid}-problem` : undefined}
  />
  <button class="quiet icon" aria-label={`${label}: add`} title="Add"><Plus /></button>
</form>
{#if problem}<p class="error" id="{uid}-problem" role="alert">{problem}</p>{/if}
{#if missing}
  {#key missing}
    <NewThings
      ids={[missing]}
      {states}
      oncreate={(created: Created[]) => add(missing!, created)}
      oncancel={() => (missing = null)}
    />
  {/key}
{/if}

<style>
  .add {
    display: flex;
    gap: var(--space-1);
    min-width: 0;
  }
  .add input {
    flex: 1;
    min-width: 0;
    font-family: var(--code-font);
  }
  .error {
    font-size: var(--text-sm);
  }
</style>
