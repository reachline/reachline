<script lang="ts">
  // A choice of kind, each with its icon, in the same list the id fields
  // suggest from. Name it with aria-labelledby; other attributes go to the button.
  import type { HTMLButtonAttributes } from 'svelte/elements';
  import Select from './Select.svelte';

  interface Props extends Omit<HTMLButtonAttributes, 'value' | 'onchange'> {
    value: string;
    options: readonly string[];
    'aria-labelledby': string;
    /** What it says with no value. */
    placeholder?: string;
    onchange: (value: string) => void;
  }
  let { options, ...rest }: Props = $props();
</script>

<Select {...rest} groups={[{ options: options.map((k) => ({ value: k, kind: k })) }]} />
