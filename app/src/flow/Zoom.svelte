<script lang="ts">
  // Zooming, and fitting the graph to the view: from the buttons, and whenever
  // fitKey changes.
  import { Minus, Plus, Scan } from '@lucide/svelte';
  import { useSvelteFlow } from '@xyflow/svelte';
  import { tick } from 'svelte';

  let { fitKey }: { fitKey: number } = $props();
  const { fitView, zoomIn, zoomOut } = useSvelteFlow();

  const duration = () => (matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 250);

  // fitView reports false until the nodes are initialized; retry a few frames.
  async function fit(tries = 20) {
    await tick();
    const ok = await fitView({ padding: 0.06, maxZoom: 1.2, duration: duration() });
    if (!ok && tries > 0) requestAnimationFrame(() => void fit(tries - 1));
  }

  $effect(() => {
    void fitKey;
    void fit();
  });
</script>

<button class="quiet icon" aria-label="Zoom in" title="Zoom in" onclick={() => zoomIn({ duration: duration() })}>
  <Plus />
</button>
<button class="quiet icon" aria-label="Zoom out" title="Zoom out" onclick={() => zoomOut({ duration: duration() })}>
  <Minus />
</button>
<button class="quiet icon" aria-label="Fit to view" title="Fit to view" onclick={() => fit(0)}><Scan /></button>
