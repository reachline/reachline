<script lang="ts">
  // The model's name, opening a menu of the user's other models.
  import { ChevronsUpDown } from '@lucide/svelte';
  import type { ModelSummary } from '../../server/api.ts';
  import { api, message } from './api';
  import { follow } from './route.svelte.ts';

  let { id, name }: { id: number; name: string } = $props();

  let models = $state<ModelSummary[] | null>(null);
  let error = $state('');
  let menu = $state<HTMLElement>();

  function ontoggle(e: ToggleEvent) {
    if (e.newState !== 'open') return;
    api.models().then(
      (m) => (models = m),
      (e: unknown) => (error = message(e)),
    );
  }

  function go(e: MouseEvent) {
    menu?.hidePopover();
    follow(e);
  }
</script>

<h1><button class="quiet" popovertarget="models-menu">{name}<ChevronsUpDown /></button></h1>
<div id="models-menu" class="menu" popover bind:this={menu} {ontoggle}>
  {#if error}
    <p class="error" role="alert">{error}</p>
  {:else if models === null}
    <p class="muted">Loading…</p>
  {:else}
    {#each models as m (m.id)}
      <a href="/m/{m.id}" aria-current={m.id === id ? 'page' : undefined} onclick={go}>{m.name}</a>
    {/each}
  {/if}
  <hr />
  <a href="/" onclick={go}>All models</a>
</div>

<style>
  h1 {
    min-width: 0;
    font-size: var(--text-lg);
  }
  h1 button {
    max-width: 100%;
    padding: 0 var(--space-2);
    font-weight: 650;
  }
  .menu {
    max-width: 20rem;
  }
  p {
    padding: var(--space-1) var(--space-3);
  }
</style>
