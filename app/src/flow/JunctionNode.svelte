<script lang="ts">
  import { Handle, Position, type NodeProps } from '@xyflow/svelte';
  import type { VNode } from '../build';

  interface Data {
    node: VNode;
    vertical: boolean;
    selected: boolean;
  }
  let { data }: NodeProps & { data: Data } = $props();
</script>

<div class="junction k-{data.node.kind}" class:sel={data.selected}>{data.node.label}</div>
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
  .k-unknown {
    font-size: 12px;
    color: var(--maybe-stroke);
    background: var(--maybe-fill);
    border: 1.5px dashed var(--maybe-stroke);
  }
  .sel {
    box-shadow: 0 0 0 2px var(--focus);
  }
  @keyframes appear {
    from {
      opacity: 0;
      transform: scale(0.6);
    }
  }
</style>
