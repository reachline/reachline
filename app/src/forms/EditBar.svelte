<script lang="ts">
  // Edit on and off, and where edits go: shared by the tabs with forms.
  import { Check, Pencil } from '@lucide/svelte';
  import type { Editing } from '../lib/edit';

  interface Props {
    edit: boolean;
    editing: Editing | null;
    onedit: (on: boolean) => void;
  }
  let { edit, editing, onedit }: Props = $props();
</script>

{#if edit && editing?.plans.length}
  <label class="field inline"
    >Edits go into
    <select
      value={editing.layer ?? ''}
      onchange={(e) => editing.setLayer(e.currentTarget.value || null)}
      class:plan={editing.layer !== null}
    >
      <option value="">the model</option>
      {#each editing.plans as p (p)}<option value={p}>plan {p}</option>{/each}
    </select>
  </label>
{/if}
<!-- Done keeps the edits, like every edit along the way; it isn't a cancel. -->
<button class:quiet={!edit} onclick={() => onedit(!edit)}>
  {#if edit}<Check />Done{:else}<Pencil />Edit{/if}
</button>

<style>
  select.plan {
    border-color: var(--accent);
    color: var(--accent);
  }
</style>
