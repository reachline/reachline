<script lang="ts">
  import { Monitor, Moon, Sun } from '@lucide/svelte';
  import { theme } from './theme.svelte.ts';

  /** The id of a visible label; without one, the group is labelled "Theme". */
  let { labelledby }: { labelledby?: string } = $props();

  const OPTIONS = [
    ['light', 'Light', Sun],
    ['dark', 'Dark', Moon],
    ['system', 'System', Monitor],
  ] as const;
</script>

<div class="segmented" role="group" aria-labelledby={labelledby} aria-label={labelledby ? undefined : 'Theme'}>
  {#each OPTIONS as [value, label, Icon] (value)}
    <button
      class="quiet icon"
      aria-pressed={theme.value === value}
      aria-label={label}
      title={label}
      onclick={() => (theme.value = value)}
    >
      <Icon />
    </button>
  {/each}
</div>
