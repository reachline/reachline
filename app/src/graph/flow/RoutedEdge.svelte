<script lang="ts">
  import type { EdgeProps } from '@xyflow/svelte';
  import type { EdgeKind } from '../../../../engine/view.ts';
  import type { Pt, Routing } from '../layout';
  import { routePath } from '../shapes';

  interface Data extends Record<string, unknown> {
    kind: EdgeKind;
    live: boolean;
    /** One of the selected node's edges. */
    lit: boolean;
    points: Pt[];
    routing: Routing;
  }
  let { data, markerEnd, sourceX, sourceY, targetX, targetY }: EdgeProps = $props();
  const d = $derived(data as Data);
  // Draw ELK's own route; fall back to a straight line if it has none.
  const path = $derived(routePath(d.points, d.routing) || `M${sourceX},${sourceY} L${targetX},${targetY}`);
</script>

<!-- A lit edge has a gap in the background's colour around it where others cross it. -->
{#if d.lit}<path class="sf-edge under" d={path} />{/if}
<path class="sf-edge k-{d.kind}" class:dead={!d.live} class:lit={d.lit} d={path} marker-end={markerEnd} />

<style>
  .sf-edge {
    fill: none;
    stroke-width: 1.4;
    transition: d 300ms ease;
  }
  .k-in {
    stroke: var(--e-in);
  }
  .k-access {
    stroke: var(--e-access);
  }
  .k-recovery {
    stroke: var(--e-recovery);
    stroke-dasharray: 6 4;
  }
  .k-needs {
    stroke: var(--e-needs);
    stroke-dasharray: 2 3;
  }
  .k-mirror {
    stroke: var(--e-mirror);
    stroke-dasharray: 8 3 2 3;
  }
  .k-part {
    stroke: var(--e-part);
    stroke-width: 1;
  }
  .dead {
    stroke: var(--e-dead);
    stroke-width: 1;
  }
  .lit {
    stroke-width: 2.8;
  }
  .under {
    stroke: var(--bg);
    stroke-width: 7;
  }
</style>
