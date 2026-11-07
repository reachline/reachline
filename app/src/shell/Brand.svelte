<script lang="ts">
  import Logo from './Logo.svelte';
</script>

<span class="brand"><Logo />ReachLine</span>

<style>
  .brand {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-lg);
    font-weight: 650;
    letter-spacing: -0.01em;
  }
</style>
