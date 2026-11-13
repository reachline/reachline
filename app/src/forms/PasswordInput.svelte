<script lang="ts">
  // A password field, with a button that shows what's typed. Its label goes
  // outside it, linked by id: a <label> can't hold the button too.
  import { Eye, EyeOff } from '@lucide/svelte';
  import type { HTMLInputAttributes } from 'svelte/elements';

  let { value = $bindable(''), ...attrs }: Omit<HTMLInputAttributes, 'type' | 'value'> & { value?: string } = $props();
  let shown = $state(false);
</script>

<span class="reveal">
  <input {...attrs} type={shown ? 'text' : 'password'} bind:value />
  <button
    type="button"
    class="quiet icon"
    aria-label="Show password"
    title={shown ? 'Hide password' : 'Show password'}
    aria-pressed={shown}
    onclick={() => (shown = !shown)}
  >
    {#if shown}<EyeOff />{:else}<Eye />{/if}
  </button>
</span>
