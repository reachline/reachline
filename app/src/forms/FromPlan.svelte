<script lang="ts">
  // In a plan: what it adds, or the fields it sets, each of which can go back to the model's.
  import { X } from '@lucide/svelte';
  import type { Editing } from '../lib/edit';

  let { editing, section, id }: { editing: Editing; section: 'things' | 'scenarios'; id: string } = $props();

  const sets = $derived(editing.sets(section, id));
</script>

{#if editing.layer}
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

<style>
  .sets {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
  }
</style>
