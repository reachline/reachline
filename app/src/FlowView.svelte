<script lang="ts">
  import { Background, MarkerType, Panel, SvelteFlow, type Edge, type Node } from '@xyflow/svelte';
  import '@xyflow/svelte/dist/style.css';
  import { describe, isJunction, type View } from './build';
  import type { Snippet } from 'svelte';
  import JunctionNode from './flow/JunctionNode.svelte';
  import RoutedEdge from './flow/RoutedEdge.svelte';
  import ThingNode from './flow/ThingNode.svelte';
  import Zoom from './flow/Zoom.svelte';
  import type { Placed } from './layout';
  import { theme } from './theme.svelte.ts';

  interface Props {
    view: View;
    placed: Placed;
    vertical: boolean;
    kind: string;
    selected: string | null;
    fitKey: number;
    /** A node was chosen, by a click or with Enter or Space. */
    onnode: (id: string) => void;
    /** The selection was cleared, by Escape or a click on empty space. */
    ondeselect: () => void;
    /** More controls, after the zoom buttons. */
    tools?: Snippet;
  }
  let { view, placed, vertical, kind, selected, fitKey, onnode, ondeselect, tools }: Props = $props();

  // Svelte Flow's own description talks of deleting and moving nodes.
  const ariaLabelConfig = {
    'node.a11yDescription.default':
      'Press Enter to select a node and see its details. Selecting a node with more ways in shows them.',
  };

  /** Svelte Flow keeps keys to its own selection, which is off; these choose a node as a click does. */
  function onkeydown(e: KeyboardEvent) {
    const el = e.target as HTMLElement;
    if (!el.classList.contains('svelte-flow__node') || !el.dataset.id) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onnode(el.dataset.id);
    } else if (e.key === 'Escape') {
      ondeselect();
    }
  }

  const nodeTypes = { thing: ThingNode, junction: JunctionNode };
  const edgeTypes = { routed: RoutedEdge };

  let nodes = $state.raw<Node[]>([]);
  let edges = $state.raw<Edge[]>([]);

  $effect(() => {
    // In reading order, so Tab follows the graph's flow: by column, or by row when it runs down.
    const at = (id: string) => placed.nodes.get(id)!;
    const order = (a: string, b: string) => {
      const [p, q] = [at(a), at(b)];
      return vertical ? p.y - q.y || p.x - q.x : p.x - q.x || p.y - q.y;
    };
    nodes = [...view.nodes]
      .sort((a, b) => order(a.id, b.id))
      .map((n) => {
        const b = at(n.id);
        return {
          id: n.id,
          type: isJunction(n.kind) ? 'junction' : 'thing',
          position: { x: b.x, y: b.y },
          width: b.w,
          height: b.h,
          draggable: false,
          ariaLabel: describe(n, kind),
          data: { node: n, vertical, selected: n.id === selected, kind },
        };
      });
    edges = view.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      type: 'routed',
      selectable: false,
      data: { kind: e.kind, live: e.live, points: placed.edges.get(e.id) ?? [], routing: placed.routing },
      markerEnd:
        e.kind === 'part'
          ? undefined
          : {
              type: MarkerType.ArrowClosed,
              width: 14,
              height: 14,
              color: e.live ? `var(--e-${e.kind})` : 'var(--e-dead)',
            },
    }));
  });
</script>

<!-- Keys come from the nodes inside, which are focusable. -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="pane kind-{kind}" {onkeydown}>
  <SvelteFlow
    bind:nodes
    bind:edges
    {nodeTypes}
    {edgeTypes}
    nodesDraggable={false}
    nodesConnectable={false}
    minZoom={0.05}
    elementsSelectable={false}
    colorMode={theme.value}
    {ariaLabelConfig}
    onnodeclick={({ node }) => onnode(node.id)}
    onpaneclick={ondeselect}
  >
    <Background />
    <Panel position="bottom-left" class="segmented floating" role="group" aria-label="Graph controls">
      <Zoom {fitKey} />
      {@render tools?.()}
    </Panel>
  </SvelteFlow>
</div>

<style>
  .pane {
    position: relative;
    width: 100%;
    height: 100%;
  }
  .pane :global(.svelte-flow) {
    --xy-background-color: var(--bg);
  }
  .pane :global(.svelte-flow__node) {
    font: var(--graph-font);
    transition: transform 300ms ease;
  }
</style>
