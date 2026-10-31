<script lang="ts">
  // A field that's a list of ids: in, needs, me, what's lost, and so on.
  import { X } from '@lucide/svelte';
  import type { Created } from './edit';
  import IdInput from './IdInput.svelte';
  import Tip from './Tip.svelte';

  interface Props {
    label: string;
    hint?: string;
    values: string[];
    ids: Map<string, string>;
    states?: boolean;
    /** Takes `unknown` too, as a place you don't know. */
    unknown?: boolean;
    onchange: (values: string[], created: Created[]) => void;
  }
  let { label, hint, values, ids, states = false, unknown = false, onchange }: Props = $props();

  const uid = $props.id();
</script>

<!-- Named by the label alone, not the ⓘ beside it in the legend. -->
<fieldset aria-labelledby="{uid}-label" aria-describedby={hint ? `${uid}-hint` : undefined}>
  <legend
    ><span id="{uid}-label">{label}</span>{#if hint}<Tip id="{uid}-hint" about={label} text={hint} />{/if}</legend
  >
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
    {unknown}
    onadd={(id: string, created: Created[]) => onchange(values.includes(id) ? values : [...values, id], created)}
  />
</fieldset>
