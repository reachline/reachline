<script lang="ts">
  // A field to add ids, suggested from the model. Ids that aren't things yet
  // can be created on the spot, each with its kind.
  import { Plus } from '@lucide/svelte';
  import { KINDS, type Kind } from '../../engine/model.ts';
  import { parseParts, validId, type Created } from './edit';

  interface Props {
    /** The field's accessible name. */
    label: string;
    placeholder?: string;
    /** Every thing, id to kind. */
    ids: Map<string, string>;
    /** Takes states only. */
    states?: boolean;
    /** Takes `a + b` and `a | b` (as options) and `?`; otherwise one id. */
    parts?: boolean;
    onadd: (options: string[][], created: Created[]) => void;
  }
  let { label, placeholder = 'Add…', ids, states = false, parts = false, onadd }: Props = $props();

  const uid = $props.id();
  let value = $state('');
  let problem = $state('');
  // Ids to create before adding, each waiting for its kind.
  let missing = $state<{ id: string; kind: Kind | '' }[]>([]);
  let pending: string[][] = [];

  function submit(e: SubmitEvent) {
    e.preventDefault();
    problem = '';
    missing = [];
    const text = value.trim();
    if (!text) return;
    const options = parts ? parseParts(text) : [[text]];
    if (!options) {
      problem = 'Something is missing beside a + or |.';
      return;
    }
    const unknown = [...new Set(options.flat())].filter((id) => !ids.has(id) && !(parts && id === '?'));
    const bad = unknown.find((id) => !validId(id));
    if (bad) {
      problem = `${bad} isn't a thing, and can't be one: ids are lowercase letters, digits and _, starting with a letter.`;
      return;
    }
    const notState = states && options.flat().find((id) => ids.has(id) && ids.get(id) !== 'state');
    if (notState) {
      problem = `${notState} isn't a state.`;
      return;
    }
    if (unknown.length) {
      pending = options;
      missing = unknown.map((id) => ({ id, kind: states ? 'state' : '' }));
      return;
    }
    add(options, []);
  }

  function add(options: string[][], created: Created[]) {
    onadd(options, created);
    value = '';
    missing = [];
  }

  const ready = $derived(missing.every((m) => m.kind));
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
{#if missing.length}
  <div class="create" role="group" aria-label="New things">
    <p>
      {missing.length === 1 ? 'This is' : 'These are'} not a thing yet. Create {missing.length === 1 ? 'it' : 'them'} as:
    </p>
    {#each missing as m (m.id)}
      <label class="field inline"
        ><span class="mono">{m.id}</span>
        <select bind:value={m.kind} disabled={states}>
          <option value="" disabled>Choose a kind</option>
          {#each KINDS as k (k)}<option value={k}>{k}</option>{/each}
        </select>
      </label>
    {/each}
    <div class="buttons">
      <button
        disabled={!ready}
        onclick={() =>
          add(
            pending,
            missing.map((m) => ({ id: m.id, kind: m.kind as Kind })),
          )}>Create and add</button
      >
      <button class="quiet" onclick={() => (missing = [])}>Cancel</button>
    </div>
  </div>
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
  .create {
    display: grid;
    gap: var(--space-2);
    padding: var(--space-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }
  .buttons {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
</style>
