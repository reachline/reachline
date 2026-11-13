<script lang="ts">
  // The logo, as the way back to the user's models, at the size Brand draws it.
  import { follow } from '../lib/route.svelte.ts';
  import Logo from './Logo.svelte';
</script>

<a class="home" href="/" onclick={follow} aria-label="Your models" title="Your models"><Logo /></a>

<style>
  .home {
    display: inline-flex;
    padding: var(--space-1);
    font-size: var(--text-lg);
  }
</style>
