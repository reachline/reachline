<script lang="ts">
  import { Waypoints } from '@lucide/svelte';
</script>

<span class="brand"><Waypoints />ReachLine</span>

<style>
  .brand {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-lg);
    font-weight: 650;
    letter-spacing: -0.01em;
  }
  .brand :global(.lucide) {
    color: var(--accent);
  }
</style>
