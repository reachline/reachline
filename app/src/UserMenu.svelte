<script lang="ts">
  import { ChevronDown, LogOut, Settings, User } from '@lucide/svelte';
  import { api, message } from './api';
  import { follow, mayLeave } from './route.svelte.ts';
  import ThemeSwitch from './ThemeSwitch.svelte';

  let { user, onsignout }: { user: string; onsignout: () => void } = $props();

  const id = $props.id();
  let menu = $state<HTMLElement>();
  let error = $state('');

  async function signOut() {
    if (!mayLeave()) return;
    error = '';
    try {
      await api.logout();
      onsignout();
    } catch (e) {
      error = message(e);
    }
  }
</script>

<button class="quiet" popovertarget="{id}-menu" aria-label="{user}: account menu">
  <User />{user}<ChevronDown />
</button>
<div id="{id}-menu" class="menu user-menu" popover bind:this={menu}>
  <a
    href="/account"
    onclick={(e) => {
      menu?.hidePopover();
      follow(e);
    }}><Settings />Account settings</a
  >
  <div class="theme"><span id="{id}-theme">Theme</span><ThemeSwitch labelledby="{id}-theme" /></div>
  <hr />
  <button class="quiet" onclick={signOut}><LogOut />Sign out</button>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
</div>

<style>
  .user-menu {
    min-width: 14rem;
  }
  .theme {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-1) var(--space-1) var(--space-1) var(--space-3);
  }
  .error {
    padding: var(--space-1) var(--space-3);
  }
</style>
