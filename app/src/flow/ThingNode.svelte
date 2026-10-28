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
  class="thing k-{n.kind} st-{n.status ?? 'plain'}"
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
  .k-account .mark {
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

  .k-location {
    --accent: var(--k-location);
  }
  .k-device {
    --accent: var(--k-device);
  }
  .k-state {
    --accent: var(--k-state);
    padding-left: 16px;
  }
  .k-secret {
    --accent: var(--k-secret);
  }
  .k-service {
    --accent: var(--k-service);
    padding-left: 14px;
  }
  .k-data {
    --accent: var(--k-data);
  }
  .k-account {
    --accent: var(--k-account);
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
