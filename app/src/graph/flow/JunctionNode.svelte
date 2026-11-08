<script lang="ts">
  import { Handle, Position, type NodeProps } from '@xyflow/svelte';
  import type { VNode } from '../../../../engine/view.ts';

  interface Data {
    node: VNode;
    vertical: boolean;
    selected: boolean;
  }
  let { data }: NodeProps & { data: Data } = $props();
</script>

<!-- What this shows is in the node's aria-label (FlowView). -->
<div class="junction k-{data.node.kind}" class:sel={data.selected} aria-hidden="true">{data.node.label}</div>
<Handle type="target" position={data.vertical ? Position.Top : Position.Left} isConnectable={false} />
<Handle type="source" position={data.vertical ? Position.Bottom : Position.Right} isConnectable={false} />

<style>
  .junction {
    width: 100%;
    animation: appear 400ms ease-out;
    height: 100%;
    border-radius: 50%;
    display: grid;
    place-items: center;
    font-size: 8px;
    font-weight: 600;
    color: var(--muted);
    background: var(--surface);
    border: 1.5px solid var(--k-junction);
  }
  /* Shaped like a thing: the centre of its border on outline()'s corners (shapes.ts). */
  .k-unknown {
    border-radius: 7.75px;
    font-size: 10px;
    color: var(--warning);
    background: var(--maybe-fill);
    border: 1.5px dashed var(--maybe-stroke);
  }
  /* Selected: a ring in the text colour, as on things. */
  .sel {
    box-shadow: 0 0 0 3px var(--text);
  }
  @keyframes appear {
    from {
      opacity: 0;
      transform: scale(0.6);
    }
  }
</style>
