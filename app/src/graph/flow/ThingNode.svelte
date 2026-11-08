<script lang="ts">
  import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from '@lucide/svelte';
  import { Handle, Position, type NodeProps } from '@xyflow/svelte';
  import type { VNode } from '../../../../engine/view.ts';
  import { verdict, type Side } from '../nodes';
  import { END, FLAG, GLYPH, ICON, ICON_SIZE, KIND_ICONS, outline } from '../shapes';
  import type { Kind } from '../../../../engine/model.ts';

  interface Data {
    node: VNode;
    vertical: boolean;
    selected: boolean;
    /** The scenario's kind, or '' for none. */
    kind: string;
    onopen?: (id: string, side: Side, open: boolean) => void;
  }
  let { data, width = 0, height = 0 }: NodeProps & { data: Data } = $props();
  const n = $derived(data.node);
  const d = $derived(outline(width, height));
  const mark = $derived(verdict(n, data.kind)?.mark);

  // A chevron in each end that has more to show (pointing out), or, while selected, something to hide (pointing in).
  const arrows = $derived.by(() => {
    if (!data.onopen) return [];
    const sides: [Side, boolean | undefined][] = [
      ['in', n.more ? true : n.expanded ? false : undefined],
      ['out', n.moreOut ? true : n.expandedOut ? false : undefined],
    ];
    return sides.flatMap(([side, open]) => {
      if (open === undefined || (!open && !data.selected)) return [];
      const back = (side === 'in') === open;
      const Icon = data.vertical ? (back ? ChevronUp : ChevronDown) : back ? ChevronLeft : ChevronRight;
      const what = side === 'in' ? 'ways in' : 'what it leads to';
      return [{ side, open, Icon, title: `${open ? 'Show' : 'Hide'} ${what}` }];
    });
  });
</script>

<!-- What all this shows is in the node's aria-label (FlowView). -->
<div
  class="thing st-{n.status ?? 'plain'}"
  class:root={n.root}
  class:sel={data.selected}
  style:--end="{END}px"
  style:--icon-gap="{ICON - ICON_SIZE}px"
  style:--glyph="{GLYPH}px"
  style:--flag="{FLAG}px"
  aria-hidden="true"
>
  <svg class="outline" {width} {height}>
    {#if data.selected}<path class="halo" {d} />{/if}
    <path {d} />
  </svg>
  <svg class="kind" viewBox="0 0 24 24" width={ICON_SIZE} height={ICON_SIZE}>
    <!-- eslint-disable-next-line svelte/no-at-html-tags -- Lucide's markup, a constant in shapes.ts -->
    {@html KIND_ICONS[n.kind as Kind]}
  </svg>
  <span class="label">{n.label}</span>
  <!-- As wide as statusWidth() in shapes.ts. -->
  {#if mark ?? n.row}<span class="status"
      >{#if mark}<span class="glyph">{mark}</span>{/if}{#if n.row}<span class="flag">!</span>{/if}</span
    >{/if}
  <!-- For the pointer; Details has the same actions for the keyboard. The click goes on to select the node. -->
  {#each arrows as a (a.side)}
    <button
      class="quiet icon node-arrow nodrag nopan {a.side}"
      tabindex="-1"
      title={a.title}
      onclick={() => data.onopen?.(n.id, a.side, a.open)}><a.Icon /></button
    >
  {/each}
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
    padding: 0 var(--end);
    color: var(--text);
    cursor: pointer;
    --fill: var(--surface);
    --stroke: var(--node-stroke);
    --sw: 1.5px;
  }
  .outline {
    position: absolute;
    inset: 0;
    overflow: visible;
  }
  .outline path {
    fill: var(--fill);
    stroke: var(--stroke);
    stroke-width: var(--sw);
  }
  .kind {
    position: relative;
    flex: none;
    margin-right: var(--icon-gap);
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .label {
    position: relative;
    white-space: nowrap;
  }
  .status {
    position: relative;
    flex: none;
    display: flex;
    padding-left: 4px;
    font-weight: 700;
  }
  .glyph {
    width: var(--glyph);
    text-align: center;
  }
  .flag {
    width: var(--flag);
    text-align: center;
    color: var(--danger);
  }
  /* In the node's ends, each end its target. */
  .node-arrow {
    position: absolute;
    top: 0;
    bottom: 0;
    width: var(--end);
  }
  .node-arrow.in {
    left: 0;
    border-radius: 7px 0 0 7px;
  }
  .node-arrow.out {
    right: 0;
    border-radius: 0 7px 7px 0;
  }
  .node-arrow :global(.lucide) {
    width: 12px;
    height: 12px;
  }

  /* Edges come from ELK, so the handles only anchor them. */
  :global(.svelte-flow__handle) {
    opacity: 0;
    pointer-events: none;
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
  }
  .st-gone {
    --fill: var(--gone-fill);
    --stroke: var(--gone-stroke);
    color: var(--gone-text);
  }
  .st-gone .outline path:not(.halo) {
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
  .outline .halo {
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
