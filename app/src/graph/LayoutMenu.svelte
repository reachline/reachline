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
</script>

<button class="quiet" popovertarget="layout" title="Layout"
  ><SlidersHorizontal /><span class="wide-only">Layout</span></button
>
<div id="layout" class="popup" popover>
  <h2>Layout</h2>
  <label class="field"
    >Direction
    <select
      value={direction}
      onchange={(e) => {
        direction = e.currentTarget.value as Direction;
        onrestart();
      }}
    >
      <option value="RIGHT">Left to right</option>
      <option value="DOWN">Top to bottom</option>
    </select>
  </label>
  <label class="field"
    >Edges
    <select
      value={routing}
      onchange={(e) => {
        routing = e.currentTarget.value as Routing;
        ontidy();
      }}
    >
      <option value="ORTHOGONAL">Right angles</option>
      <option value="SPLINES">Curves</option>
      <option value="POLYLINE">Straight segments</option>
    </select>
  </label>
  <label class="field"
    >Placement
    <select
      value={placement}
      onchange={(e) => {
        placement = e.currentTarget.value as Placement;
        ontidy();
      }}
    >
      <option value="BRANDES_KOEPF">Brandes–Köpf (fast)</option>
      <option value="NETWORK_SIMPLEX">Network simplex</option>
    </select>
  </label>
  {#if stats}
    <p class="muted stats">{stats.nodes} nodes, {stats.edges} edges, laid out in {stats.ms} ms</p>
  {/if}
</div>

<style>
  #layout {
    min-width: 14rem;
  }
  #layout h2 {
    font-size: var(--text-md);
  }
  .stats {
    font-size: var(--text-sm);
  }
</style>
