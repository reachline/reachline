<script lang="ts">
  // Asks before a guided edit, with what it would do: plans it would leave
  // broken, its changes to the layer, and the verdicts after it.
  import type { ScenarioChange } from '../../../engine/report.ts';
  import type { Change } from '../lib/edit';
  import Verdicts from '../panel/Verdicts.svelte';
  import Confirm from './Confirm.svelte';

  interface Props {
    asking: {
      title: string;
      text: string;
      action: string;
      danger: boolean;
      warnings: string[];
      changes: Change[];
      verdicts: ScenarioChange[] | null;
    } | null;
    onconfirm: () => void;
    onclose: () => void;
  }
  let { asking, onconfirm, onclose }: Props = $props();
</script>

<Confirm question={asking} {onconfirm} {onclose}>
  {#if asking}
    {#each asking.warnings as w (w)}<p class="notice">{w}</p>{/each}
    {#if asking.changes.length}
      <ul class="changes">
        {#each asking.changes as c, i (i)}
          <li>
            <b class="mono">{c.id}</b>{#if c.field}&nbsp;{c.field}{/if}:
            {#if c.field}<span class="mono">{c.before}</span>&nbsp;→&nbsp;{/if}<span class="mono">{c.after}</span>
          </li>
        {/each}
      </ul>
    {/if}
    {#if asking.verdicts}
      <h3>Verdicts</h3>
      <div class="scroll"><Verdicts changes={asking.verdicts} /></div>
    {/if}
  {/if}
</Confirm>

<style>
  .scroll {
    max-height: 30vh;
    overflow-y: auto;
  }
  .changes {
    display: grid;
    gap: var(--space-2);
    max-height: 40vh;
    margin: 0;
    padding-left: var(--space-4);
    overflow-y: auto;
    font-size: var(--text-sm);
  }
</style>
