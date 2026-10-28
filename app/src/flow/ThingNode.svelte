<script lang="ts">
  import { Handle, Position, type NodeProps } from '@xyflow/svelte';
  import type { VNode } from '../build';
  import { shapePath } from '../shapes';

  interface Data {
    node: VNode;
    vertical: boolean;
    selected: boolean;
  }
  let { data, width = 0, height = 0 }: NodeProps & { data: Data } = $props();
  const n = $derived(data.node);
</script>

<div
  class="thing sec-{n.kind} st-{n.status ?? 'plain'}"
  class:root={n.root}
  class:sel={data.selected}
  title={n.row ?? ''}
>
  <svg {width} {height} aria-hidden="true"><path d={shapePath(n.kind, width, height)} /></svg>
  <span class="label">{n.label}</span>
  {#if n.more}<span class="mark more" title="has more ways in: click to expand">+</span>
  {:else if n.row}<span class="mark row" title={n.row}>!</span>{/if}
</div>
<Handle type="target" position={data.vertical ? Position.Top : Position.Left} isConnectable={false} />
<Handle type="source" position={data.vertical ? Position.Bottom : Position.Right} isConnectable={false} />

<style>
  .thing {
    position: relative;
    animation: appear 400ms ease-out;
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    padding: 0 22px 0 12px;
    color: var(--text);
    cursor: pointer;
    --fill: var(--surface);
    --stroke: var(--accent);
    --sw: 1.5px;
  }
  svg {
    position: absolute;
    inset: 0;
    overflow: visible;
  }
  path {
    fill: var(--fill);
    stroke: var(--stroke);
    stroke-width: var(--sw);
  }
  .label {
    position: relative;
    white-space: nowrap;
  }
  .mark {
    position: absolute;
    right: 7px;
    font-weight: 700;
    line-height: 1;
  }
  .sec-accounts .mark {
    right: 12px;
  }
  .more {
    color: var(--muted);
  }
  /* Edges come from ELK, so the handles only anchor them. */
  :global(.svelte-flow__handle) {
    opacity: 0;
    pointer-events: none;
  }
  .row {
    color: var(--bad-stroke);
  }

  .sec-locations {
    --accent: var(--s-locations);
  }
  .sec-devices {
    --accent: var(--s-devices);
  }
  .sec-states {
    --accent: var(--s-states);
    padding-left: 16px;
  }
  .sec-secrets {
    --accent: var(--s-secrets);
  }
  .sec-services {
    --accent: var(--s-services);
    padding-left: 14px;
  }
  .sec-data {
    --accent: var(--s-data);
  }
  .sec-accounts {
    --accent: var(--s-accounts);
    padding-left: 14px;
  }

  .st-has {
    --fill: var(--good-fill);
  }
  :global(.kind-breach) .st-has {
    --fill: var(--bad-fill);
  }
  .st-maybe {
    --fill: var(--maybe-fill);
  }
  .st-lost {
    --fill: var(--bad-fill);
    --stroke: var(--bad-stroke);
    --sw: 2.5px;
  }
  .st-gone {
    --fill: var(--gone-fill);
    --stroke: var(--gone-stroke);
    color: var(--gone-text);
  }
  .st-gone path {
    stroke-dasharray: 4 3;
  }
  .st-start {
    --fill: var(--start-fill);
    --stroke: var(--start-stroke);
    color: var(--start-text);
  }
  .root {
    --sw: 3px;
  }
  .sel svg {
    filter: drop-shadow(0 0 3px var(--focus)) drop-shadow(0 0 1px var(--focus));
  }
  @keyframes appear {
    from {
      opacity: 0;
      transform: scale(0.85);
    }
  }
</style>
