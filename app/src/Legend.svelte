<script lang="ts">
  import { Shapes } from '@lucide/svelte';
  import { KINDS } from '../../engine/model.ts';
  import { shapePath } from './shapes';

  const EDGES = [
    ['in', 'in'],
    ['access', 'access'],
    ['recovery', 'recovery'],
    ['needs', 'needs'],
    ['mirror', 'mirror'],
    ['part', 'into AND/OR'],
  ] as const;
</script>

<button class="quiet" popovertarget="legend"><Shapes />Legend</button>
<div id="legend" class="popup" popover>
  <h2>Legend</h2>
  <div class="grid">
    {#each KINDS as k (k)}
      <svg width="44" height="18" aria-hidden="true">
        <path d={shapePath(k, 44, 18)} class="shape" style:stroke="var(--k-{k})" />
      </svg>
      <span>{k}</span>
    {/each}
    {#each EDGES as [k, label] (k)}
      <svg width="44" height="10" aria-hidden="true"><line x1="2" y1="5" x2="42" y2="5" class="e-{k}" /></svg>
      <span>{label}</span>
    {/each}
  </div>
</div>

<style>
  h2 {
    margin-bottom: var(--space-2);
    font-size: var(--text-md);
  }
  .grid {
    display: grid;
    grid-template-columns: 48px 1fr;
    gap: var(--space-1) var(--space-2);
    align-items: center;
  }
  .shape {
    fill: var(--surface);
    stroke-width: 1.5;
  }
  line {
    stroke-width: 1.6;
  }
  .e-in {
    stroke: var(--e-in);
  }
  .e-access {
    stroke: var(--e-access);
  }
  .e-recovery {
    stroke: var(--e-recovery);
    stroke-dasharray: 6 4;
  }
  .e-needs {
    stroke: var(--e-needs);
    stroke-dasharray: 2 3;
  }
  .e-mirror {
    stroke: var(--e-mirror);
    stroke-dasharray: 8 3 2 3;
  }
  .e-part {
    stroke: var(--e-part);
    stroke-width: 1;
  }
</style>
