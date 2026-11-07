<script lang="ts">
  import Brand from './Brand.svelte';
  import UserMenu from './UserMenu.svelte';

  let { user, onsignout }: { user: string; onsignout: () => void } = $props();
</script>

<header class="top">
  <Brand />
  <UserMenu {user} {onsignout} />
</header>

<style>
  .top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-2) var(--space-4);
    border-bottom: 1px solid var(--border);
    background: var(--surface);
  }
</style>
