<script lang="ts">
  // How the graph is laid out, and what the last layout took. Each choice is
  // made and acted on in one handler: with bind:value as well, the layout can
  // run between the two and miss the restart (as it seemed to in Firefox on Android).
  import { SlidersHorizontal } from '@lucide/svelte';
  import type { Direction, Placement, Routing } from './layout';

  interface Props {
    direction: Direction;
    routing: Routing;
    placement: Placement;
    /** A new direction starts the view afresh. */
    onrestart: () => void;
    /** New edges or placement lay it out again. */
    ontidy: () => void;
    stats?: { nodes: number; edges: number; ms: number };
  }
  /* eslint-disable @typescript-eslint/no-useless-default-assignment -- $bindable() is how Svelte marks a prop bindable */
  let {
    direction = $bindable(),
    routing = $bindable(),
    placement = $bindable(),
    onrestart,
    ontidy,
    stats,
  }: Props = $props();
  /* eslint-enable @typescript-eslint/no-useless-default-assignment */

  const uid = $props.id();
</script>

<button class="quiet" popovertarget="layout" title="Layout"
  ><SlidersHorizontal /><span class="wide-only">Layout</span></button
>
<div id="layout" class="popup" popover>
  <h2>Layout</h2>
  {@render choice(
    'Direction',
    [
      ['RIGHT', 'Left to right'],
      ['DOWN', 'Top to bottom'],
    ],
    direction,
    (v) => {
      direction = v as Direction;
      onrestart();
    },
  )}
  {@render choice(
    'Edges',
    [
      ['ORTHOGONAL', 'Right angles'],
      ['SPLINES', 'Curves'],
      ['POLYLINE', 'Straight'],
    ],
    routing,
    (v) => {
      routing = v as Routing;
      ontidy();
    },
  )}
  {@render choice(
    'Placement',
    [
      ['BRANDES_KOEPF', 'Brandes–Köpf'],
      ['NETWORK_SIMPLEX', 'Network simplex'],
    ],
    placement,
    (v) => {
      placement = v as Placement;
      ontidy();
    },
    'Brandes–Köpf is the faster.',
  )}
  {#if stats}
    <p class="muted stats">{stats.nodes} nodes, {stats.edges} edges, laid out in {stats.ms} ms</p>
  {/if}
</div>

<!-- One of a few options, all in view: a .segmented group, as the toolbar's View is. -->
{#snippet choice(
  label: string,
  options: [string, string][],
  value: string,
  onchoose: (value: string) => void,
  hint?: string,
)}
  {@const id = `${uid}-${label.toLowerCase()}`}
  <div class="field">
    <span {id}>{label}</span>
    <div class="segmented" role="group" aria-labelledby={id} aria-describedby={hint ? `${id}-hint` : undefined}>
      {#each options as [v, words] (v)}
        <button class="quiet" aria-pressed={value === v} onclick={() => value !== v && onchoose(v)}>{words}</button>
      {/each}
    </div>
    {#if hint}<span id="{id}-hint" class="hint">{hint}</span>{/if}
  </div>
{/snippet}

<style>
  /* As wide as the popup, its options sharing the width, so the rows line up. */
  .segmented {
    display: flex;
  }
  .segmented button {
    flex: 1 1 auto;
  }
  #layout h2 {
    font-size: var(--text-md);
  }
  .stats {
    font-size: var(--text-sm);
  }
</style>
