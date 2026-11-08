<script lang="ts">
  import { ChevronLeft, ChevronRight, Shapes } from '@lucide/svelte';
  import { KINDS } from '../../../engine/model.ts';
  import KindIcon from '../shell/KindIcon.svelte';

  const EDGES = [
    ['in', 'in'],
    ['access', 'access'],
    ['recovery', 'recovery'],
    ['needs', 'needs'],
    ['mirror', 'mirror'],
    ['part', 'into AND/OR'],
    ['dead', 'can’t carry access in the scenario'],
  ] as const;

  // How a scenario marks things. The glyphs match verdict() in build.ts.
  const STATUSES = [
    ['good', '✓', 'reached'],
    ['bad', '✗', 'lost, or reached by the attacker'],
    ['maybe', '?', 'reached if assumptions hold'],
    ['start', '', 'where the attacker starts'],
    ['gone', '', 'gone in the scenario'],
  ] as const;
</script>

<button class="quiet" popovertarget="legend"><Shapes />Legend</button>
<div id="legend" class="popup" popover>
  <h2>Legend</h2>
  <div class="grid">
    {#each KINDS as k (k)}
      <KindIcon kind={k} />
      <span>{k}</span>
    {/each}
    {#each EDGES as [k, label] (k)}
      <svg width="44" height="10" aria-hidden="true"><line x1="2" y1="5" x2="42" y2="5" class="e-{k}" /></svg>
      <span>{label}</span>
    {/each}
    <span class="more" aria-hidden="true"><ChevronLeft /><ChevronRight /></span>
    <span>more ways in, or more it’s a way into, that side; click to show it</span>
  </div>
  <h3>In a scenario</h3>
  <div class="grid">
    {#each STATUSES as [k, mark, label] (k)}
      <span class="swatch st-{k}" aria-hidden="true">{mark}</span>
      <span>{label}</span>
    {/each}
    <span class="swatch" aria-hidden="true"><b class="row">!</b></span>
    <span>checked, and reported by the scenario</span>
  </div>
</div>

<style>
  #legend {
    max-width: 20rem;
  }
  h2,
  h3 {
    margin-bottom: var(--space-2);
    font-size: var(--text-md);
  }
  h3 {
    margin-top: var(--space-3);
  }
  .grid {
    display: grid;
    grid-template-columns: 48px 1fr;
    gap: var(--space-1) var(--space-2);
    align-items: center;
  }
  .grid > :global(.kind-icon) {
    justify-self: center;
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
  .e-dead {
    stroke: var(--e-dead);
    stroke-width: 1;
  }
  .swatch {
    display: grid;
    place-items: center;
    width: 44px;
    height: 18px;
    border: 1.5px solid var(--border);
    border-radius: 3px;
    background: var(--surface);
    font-weight: 700;
    line-height: 1;
  }
  .st-good {
    background: var(--good-fill);
  }
  .st-bad {
    background: var(--bad-fill);
  }
  .st-maybe {
    background: var(--maybe-fill);
  }
  .st-start {
    border-color: var(--start-stroke);
    background: var(--start-fill);
    color: var(--start-text);
  }
  .st-gone {
    border: 1.5px dashed var(--gone-stroke);
    background: var(--gone-fill);
  }
  .more {
    display: flex;
    justify-content: center;
    width: 44px;
    color: var(--muted);
  }
  .row {
    color: var(--danger);
  }
</style>
