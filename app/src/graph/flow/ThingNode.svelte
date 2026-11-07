<script lang="ts">
  import { Handle, Position, type NodeProps } from '@xyflow/svelte';
  import { verdict, type VNode } from '../build';
  import { shapePath } from '../shapes';

  interface Data {
    node: VNode;
    vertical: boolean;
    selected: boolean;
    /** The scenario's kind, or '' for none. */
    kind: string;
  }
  let { data, width = 0, height = 0 }: NodeProps & { data: Data } = $props();
  const n = $derived(data.node);
  const d = $derived(shapePath(n.kind, width, height));
</script>

<!-- What all this shows is in the node's aria-label (FlowView). -->
<div class="thing k-{n.kind} st-{n.status ?? 'plain'}" class:root={n.root} class:sel={data.selected} aria-hidden="true">
  <svg {width} {height}>
    {#if data.selected}<path class="halo" {d} />{/if}
    <path {d} />
  </svg>
  {#if n.status}<span class="glyph">{verdict(n, data.kind)?.mark ?? ''}</span>{/if}
  <span class="label">{n.label}</span>
  {#if n.more}<span class="mark more">+</span>
  {:else if n.row}<span class="mark row">!</span>{/if}
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
  /* As wide as STATUS_SLOT in shapes.ts, gap included. */
  .glyph {
    position: relative;
    flex: none;
    width: 12px;
    margin-right: 4px;
    font-weight: 700;
    text-align: center;
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
    color: var(--danger);
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
  /* Selected: a ring in the text colour around the shape. Focus is the usual ring, around the box. */
  .halo {
    fill: none;
    stroke: var(--text);
    stroke-width: calc(var(--sw) + 6px);
    stroke-dasharray: none;
  }
  @keyframes appear {
    from {
      opacity: 0;
      transform: scale(0.85);
    }
  }
</style>
