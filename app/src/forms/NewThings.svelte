<script lang="ts">
  // Ids a field refers to that aren't things yet: each gets a kind, and then
  // they're created along with the edit that refers to them.
  import { untrack } from 'svelte';
  import { KINDS, type Kind } from '../../../engine/model.ts';
  import type { Created } from '../lib/edit';
  import KindSelect from './KindSelect.svelte';

  interface Props {
    ids: string[];
    /** States only: the kind is fixed. */
    states?: boolean;
    oncreate: (created: Created[]) => void;
    oncancel: () => void;
  }
  let { ids, states = false, oncreate, oncancel }: Props = $props();

  const uid = $props.id();

  // Asked once: the owner keys this on the ids, so new ones start afresh.
  const kinds = $state<{ id: string; kind: Kind | '' }[]>(
    untrack(() => ids.map((id) => ({ id, kind: states ? 'state' : '' }))),
  );
  const ready = $derived(kinds.every((m) => m.kind));
</script>

<div class="create" role="group" aria-label="New things">
  <p>
    {ids.length === 1 ? 'This is' : 'These are'} not a thing yet. Create {ids.length === 1 ? 'it' : 'them'} as:
  </p>
  {#each kinds as m, i (m.id)}
    <div class="field inline">
      <span class="mono" id="{uid}-{i}">{m.id}</span>
      <KindSelect
        aria-labelledby="{uid}-{i}"
        value={m.kind}
        options={KINDS}
        placeholder="Choose a kind"
        disabled={states}
        onchange={(k: string) => (m.kind = k as Kind)}
      />
    </div>
  {/each}
  <div class="buttons">
    <button disabled={!ready} onclick={() => oncreate(kinds.map((m) => ({ id: m.id, kind: m.kind as Kind })))}
      >Create and add</button
    >
    <button class="quiet" onclick={oncancel}>Cancel</button>
  </div>
</div>

<style>
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
