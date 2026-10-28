<script lang="ts">
  import { Background, Controls, MarkerType, SvelteFlow, type Edge, type Node } from '@xyflow/svelte';
  import '@xyflow/svelte/dist/style.css';
  import { isJunction, type View } from './build';
  import Fit from './flow/Fit.svelte';
  import JunctionNode from './flow/JunctionNode.svelte';
  import RoutedEdge from './flow/RoutedEdge.svelte';
  import ThingNode from './flow/ThingNode.svelte';
  import type { Placed } from './layout';

  interface Props {
    view: View;
    placed: Placed;
    vertical: boolean;
    kind: string;
    selected: string | null;
    fitKey: number;
    onnode: (id: string) => void;
  }
  let { view, placed, vertical, kind, selected, fitKey, onnode }: Props = $props();

  const nodeTypes = { thing: ThingNode, junction: JunctionNode };
  const edgeTypes = { routed: RoutedEdge };

  let nodes = $state.raw<Node[]>([]);
  let edges = $state.raw<Edge[]>([]);

  $effect(() => {
    nodes = view.nodes.map((n) => {
      const b = placed.nodes.get(n.id)!;
      return {
        id: n.id,
        type: isJunction(n.kind) ? 'junction' : 'thing',
        position: { x: b.x, y: b.y },
        width: b.w,
        height: b.h,
        draggable: false,
        data: { node: n, vertical, selected: n.id === selected },
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

<div class="pane kind-{kind}">
  <SvelteFlow
    bind:nodes
    bind:edges
    {nodeTypes}
    {edgeTypes}
    nodesDraggable={false}
    nodesConnectable={false}
    minZoom={0.05}
    colorMode="system"
    onnodeclick={({ node }) => onnode(node.id)}
  >
    <Background />
    <Controls showLock={false} />
    <Fit {fitKey} />
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
    transition: transform 300ms ease;
  }
</style>
