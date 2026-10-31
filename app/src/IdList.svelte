<script lang="ts">
  // A field that's a list of ids: in, needs, me, what's lost, and so on.
  import { X } from '@lucide/svelte';
  import type { Created } from './edit';
  import IdInput from './IdInput.svelte';

  interface Props {
    label: string;
    hint?: string;
    values: string[];
    ids: Map<string, string>;
    states?: boolean;
    onchange: (values: string[], created: Created[]) => void;
  }
  let { label, hint, values, ids, states = false, onchange }: Props = $props();

  const uid = $props.id();
</script>

<fieldset aria-describedby={hint ? `${uid}-hint` : undefined}>
  <legend>{label}</legend>
  {#if hint}<p class="hint" id="{uid}-hint">{hint}</p>{/if}
  {#if values.length}
    <ul class="chips">
      {#each values as v, i (i)}
        <li class="chip">
          {v}<button
            class="quiet icon"
            aria-label={`Remove ${v} from ${label.toLowerCase()}`}
            title="Remove"
            onclick={() =>
              onchange(
                values.filter((_, j) => j !== i),
                [],
              )}><X /></button
          >
        </li>
      {/each}
    </ul>
  {/if}
  <IdInput
    label={`Add to ${label.toLowerCase()}`}
    {ids}
    {states}
    onadd={(options: string[][], created: Created[]) =>
      onchange([...values, ...options.flat().filter((id) => !values.includes(id))], created)}
  />
</fieldset>
