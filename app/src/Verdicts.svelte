<script lang="ts">
  // Verdicts before and after a change (plans turned on, a thing deleted),
  // scenario by scenario, as the CLI's plan report gives them.
  import type { ScenarioChange } from '../../engine/report.ts';

  let { changes }: { changes: ScenarioChange[] } = $props();

  const shown = $derived(changes.filter((c) => !c.sc || c.changed.length));
</script>

{#if shown.length}
  <ul class="verdicts">
    {#each shown as c (c.name)}
      <li>
        <span class="mono name">{c.name}</span>
        {#if !c.sc}
          <span class="muted">removed</span>
        {:else}
          <ul>
            {#each c.changed as t (t.thing)}
              <li><span class="mono">{t.thing}</span>: {t.before} → <b>{t.after}</b></li>
            {/each}
          </ul>
        {/if}
      </li>
    {/each}
  </ul>
{:else}
  <p class="muted">No verdict changes in any scenario.</p>
{/if}

<style>
  .verdicts,
  .verdicts ul {
    display: grid;
    gap: var(--space-1);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .verdicts {
    gap: var(--space-3);
  }
  .verdicts ul {
    padding-left: var(--space-3);
    font-size: var(--text-sm);
  }
  .name {
    font-weight: 600;
  }
</style>
