<script lang="ts">
  // A thing's, scenario's or plan's name. A change renames it everywhere; a
  // name that can't be used is explained, and the field goes back.
  interface Props {
    label: string;
    value: string;
    /** Why it can't be renamed, if it can't; shown, with the field disabled. */
    fixed?: string;
    /** Renames it; gives a problem with the name, if there is one. */
    onrename: (to: string) => string;
  }
  let { label, value, fixed, onrename }: Props = $props();

  const uid = $props.id();
  let problem = $state('');

  function onchange(e: Event & { currentTarget: HTMLInputElement }) {
    const to = e.currentTarget.value.trim();
    problem = to === value ? '' : onrename(to);
    if (problem) e.currentTarget.value = value;
  }
</script>

<div class="field">
  <label for="{uid}-name">{label}</label>
  <input
    id="{uid}-name"
    {value}
    {onchange}
    disabled={!!fixed}
    autocomplete="off"
    autocapitalize="off"
    spellcheck="false"
    aria-describedby="{uid}-hint"
    aria-invalid={problem ? 'true' : undefined}
  />
  {#if problem}
    <span class="hint error" id="{uid}-hint" role="alert">{problem}</span>
  {:else}
    <span class="hint" id="{uid}-hint">{fixed ?? 'Renaming changes it everywhere it’s used.'}</span>
  {/if}
</div>

<style>
  input {
    font-family: var(--code-font);
  }
</style>
