<script lang="ts">
  // What a field is for, behind an ⓘ beside its label. The field still names
  // the text with aria-describedby={id}: hidden text that's referenced that
  // way is read all the same.
  import { Info } from '@lucide/svelte';

  interface Props {
    id: string;
    /** What it explains, for the button's name. */
    about: string;
    text: string;
  }
  let { id, about, text }: Props = $props();
</script>

<button type="button" class="quiet icon tip" popovertarget={id} aria-label={`About ${about}`}><Info /></button>
<span {id} class="popup tip" popover>{text}</span>
