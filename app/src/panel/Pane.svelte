<script lang="ts">
  // What the tabs about a choice share: its name and kind, Edit, and why the
  // forms are off when they are; then its <section>s.
  import { Check, Pencil } from '@lucide/svelte';
  import type { Snippet } from 'svelte';
  import type { Off } from '../lib/edit';
  import KindIcon from '../shell/KindIcon.svelte';

  interface Props {
    /** What's chosen; none, and there's only Edit. */
    name?: string;
    kind?: string;
    edit: boolean;
    /** Whether the text loads, so the forms can show. */
    editable: boolean;
    onedit: (on: boolean) => void;
    off: Off;
    children: Snippet;
  }
  let { name, kind, edit, editable, onedit, off, children }: Props = $props();
</script>

<div class="pane">
  <div class="top">
    {#if name}<h2><KindIcon {kind} /><span class="mono">{name}</span> <span class="muted">{kind}</span></h2>{/if}
    <!-- Done keeps the edits, like every edit along the way; it isn't a cancel. -->
    <button class:quiet={!edit} onclick={() => onedit(!edit)}>
      {#if edit}<Check />Done{:else}<Pencil />Edit{/if}
    </button>
  </div>
  {#if edit && !editable}
    <p class="notice" role="status">
      {off.why}, so the forms are off until that's fixed. <button onclick={off.onfix}>{off.fix}</button>
    </p>
  {/if}
  {@render children()}
</div>

<style>
  .pane {
    display: grid;
    align-content: start;
    gap: var(--space-4);
    height: 100%;
    overflow-y: auto;
    padding: var(--space-4);
  }
  .top {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-2);
  }
  .top button {
    margin-left: auto;
  }
  h2 :global(.kind-icon) {
    margin-right: var(--space-1);
    vertical-align: -0.2em;
  }
  h2 {
    padding-top: var(--space-1);
    font-size: var(--text-md);
    overflow-wrap: anywhere;
  }
  .pane > :global(section) {
    display: grid;
    gap: var(--space-2);
  }
  .pane > :global(section + section) {
    padding-top: var(--space-4);
    border-top: 1px solid var(--border);
  }
</style>
