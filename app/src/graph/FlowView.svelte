<script lang="ts">
  import { Background, MarkerType, Panel, SvelteFlow, type Edge, type Node } from '@xyflow/svelte';
  import '@xyflow/svelte/dist/style.css';
  import { isJunction, type View } from '../../../engine/view.ts';
  import { describe, drawnAs, edgesOf, type Side } from './nodes';
  import { untrack, type Snippet } from 'svelte';
  import JunctionNode from './flow/JunctionNode.svelte';
  import RoutedEdge from './flow/RoutedEdge.svelte';
  import ThingNode from './flow/ThingNode.svelte';
  import Zoom from './flow/Zoom.svelte';
  import type { Placed } from './layout';
  import { theme } from '../lib/theme.svelte.ts';

  interface Props {
    view: View;
    placed: Placed;
    vertical: boolean;
    kind: string;
    selected: string | null;
    fitKey: number;
    /** How much of the graph's right side is under the panel, in px; fitting keeps clear of it. */
    cover: number;
    /** A node was chosen, by a click or with Enter or Space. */
    onnode: (id: string) => void;
    /** Shows or hides a node's ways in, or what it's a way into; without it, nodes have no arrows. */
    onopen?: (id: string, side: Side, open: boolean) => void;
    /** A node was opened to edit, by a double click or with Shift+Enter. */
    onedit: (id: string) => void;
    /** The selection was cleared, by Escape or a click on empty space. */
    ondeselect: () => void;
    /** More controls, after the zoom buttons. */
    tools?: Snippet;
  }
  let { view, placed, vertical, kind, selected, fitKey, cover, onnode, onopen, onedit, ondeselect, tools }: Props =
    $props();

  // Svelte Flow's own description talks of deleting and moving nodes.
  const ariaLabelConfig = {
    'node.a11yDescription.default': 'Press Enter to select a node and see its details, or Shift+Enter to edit it.',
  };

  /** Svelte Flow keeps keys to its own selection, which is off; these choose a node as a click does. */
  function onkeydown(e: KeyboardEvent) {
    const el = e.target as HTMLElement;
    if (!el.classList.contains('svelte-flow__node') || !el.dataset.id) return;
    if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault();
      onedit(el.dataset.id);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onnode(el.dataset.id);
    } else if (e.key === 'Escape') {
      ondeselect();
    }
  }

  /** Svelte Flow has no double click for nodes; this is one, on a node but not its chevrons. */
  function ondblclick(e: MouseEvent) {
    const el = e.target as HTMLElement;
    const id = el.closest<HTMLElement>('.svelte-flow__node')?.dataset.id;
    if (id && !el.closest('.node-arrow')) onedit(id);
  }

  const nodeTypes = { thing: ThingNode, junction: JunctionNode };
  const edgeTypes = { routed: RoutedEdge };

  let nodes = $state.raw<Node[]>([]);
  let edges = $state.raw<Edge[]>([]);

  const laidOut = $derived.by((): Node[] => {
    // In reading order, so Tab follows the graph's flow: by column, or by row when it runs down.
    const at = (id: string) => placed.nodes.get(id)!;
    const order = (a: string, b: string) => {
      const [p, q] = [at(a), at(b)];
      return vertical ? p.y - q.y || p.x - q.x : p.x - q.x || p.y - q.y;
    };
    return [...view.nodes]
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
          data: { node: n, vertical, selected: false, kind, onopen },
        };
      });
  });

  // A new selection replaces only the nodes it changes, so Svelte Flow redraws only those.
  let lastLaidOut: Node[] = [];
  $effect(() => {
    const from = laidOut === lastLaidOut ? untrack(() => nodes) : laidOut;
    lastLaidOut = laidOut;
    nodes = from.map((n) => {
      const sel = n.id === selected;
      return n.data.selected === sel ? n : { ...n, data: { ...n.data, selected: sel } };
    });
  });

  const as = $derived(drawnAs(view));
  const laidEdges = $derived(
    view.edges.map((e): Edge => ({
      id: e.id,
      source: e.source,
      target: e.target,
      type: 'routed',
      selectable: false,
      data: {
        kind: e.kind,
        as: as.get(e.id),
        live: e.live,
        lit: false,
        points: placed.edges.get(e.id) ?? [],
        routing: placed.routing,
      },
      markerEnd:
        e.kind === 'part'
          ? undefined
          : {
              type: MarkerType.ArrowClosed,
              width: 14,
              height: 14,
              color: e.live ? `var(--e-${e.kind})` : 'var(--gone-stroke)',
            },
    })),
  );

  const lit = $derived(selected ? edgesOf(view, selected) : new Set<string>());

  // Lit edges go last, so they're drawn over the rest.
  $effect(() => {
    // Arrowheads scale with the stroke, so a thicker edge gets a smaller one, drawn about the size of the rest.
    const head = (m: Edge['markerEnd']) => (typeof m === 'object' ? { ...m, width: 8, height: 8 } : m);
    const on = laidEdges
      .filter((e) => lit.has(e.id))
      .map((e) => ({ ...e, markerEnd: head(e.markerEnd), data: { ...e.data, lit: true } }));
    edges = [...laidEdges.filter((e) => !lit.has(e.id)), ...on];
  });
</script>

<!-- Keys and double clicks come from the nodes inside, which are focusable. -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="pane kind-{kind}" {onkeydown} {ondblclick}>
  <SvelteFlow
    bind:nodes
    bind:edges
    {nodeTypes}
    {edgeTypes}
    nodesDraggable={false}
    nodesConnectable={false}
    minZoom={0.05}
    zoomOnDoubleClick={false}
    elementsSelectable={false}
    colorMode={theme.value}
    {ariaLabelConfig}
    proOptions={{ hideAttribution: true }}
    onnodeclick={({ node }) => onnode(node.id)}
    onpaneclick={ondeselect}
  >
    <Background />
    <Panel position="bottom-left" class="segmented floating" role="group" aria-label="Graph controls">
      <Zoom {fitKey} {cover} />
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
  /* As far in from the edges as what else floats over the graph. */
  .pane :global(.svelte-flow__panel) {
    margin: var(--space-2);
  }
  .pane :global(.svelte-flow__node) {
    font: var(--graph-font);
    transition: transform 300ms ease;
  }
</style>
