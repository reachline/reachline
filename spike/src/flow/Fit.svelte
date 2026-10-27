<script lang="ts">
  import { useSvelteFlow } from '@xyflow/svelte';
  import { tick } from 'svelte';

  let { fitKey }: { fitKey: number } = $props();
  const { fitView } = useSvelteFlow();

  // fitView reports false until the nodes are initialized; retry a few frames.
  async function fit(tries = 20) {
    await tick();
    const ok = await fitView({ padding: 0.06, maxZoom: 1.2, duration: 250 });
    if (!ok && tries > 0) requestAnimationFrame(() => fit(tries - 1));
  }

  $effect(() => {
    void fitKey;
    fit();
  });
</script>
