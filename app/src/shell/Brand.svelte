<script lang="ts">
  // The logo and the name; signed in, the logo leads back to the user's models.
  import Home from './Home.svelte';
  import Logo from './Logo.svelte';

  let { home = false }: { home?: boolean } = $props();
</script>

<span class="brand"
  >{#if home}<Home />{:else}<Logo />{/if}ReachLine</span
>

<style>
  .brand {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-lg);
    font-weight: 650;
    letter-spacing: -0.01em;
  }
  /* Its padding, a bigger target, kept out of the line-up. */
  .brand > :global(.home) {
    margin: calc(-1 * var(--space-1));
  }
</style>
