<script lang="ts">
  // Asks for a name, and a kind if it has one: a new thing, scenario or plan.
  import { nameProblem } from '../lib/edit';
  import KindSelect from '../forms/KindSelect.svelte';

  interface Props {
    title: string;
    /** A name to show as an example. */
    example: string;
    kinds?: readonly string[];
    /** Whether a name is already in use. */
    taken: (name: string) => boolean;
    onadd: (name: string, kind: string) => void;
    /** The <dialog>, for its owner to open with showModal(). */
    dialog?: HTMLDialogElement;
  }
  let { title, example, kinds, taken, onadd, dialog = $bindable() }: Props = $props();

  const uid = $props.id();
  let name = $state('');
  let kind = $state('');
  let problem = $state('');
  let kindProblem = $state('');

  // Each time it opens, it starts empty.
  function reset() {
    name = '';
    kind = '';
    problem = '';
    kindProblem = '';
  }

  function submit(e: SubmitEvent) {
    e.preventDefault();
    const n = name.trim();
    problem = nameProblem(n, taken);
    if (problem) return;
    if (kinds && !kind) kindProblem = 'Choose a kind.';
    else {
      dialog?.close();
      onadd(n, kind);
    }
  }
</script>

<dialog bind:this={dialog} aria-labelledby="{uid}-title" onclose={reset}>
  <form onsubmit={submit}>
    <h2 id="{uid}-title">{title}</h2>
    <div class="field">
      <label for="{uid}-name">Name</label>
      <input
        id="{uid}-name"
        bind:value={name}
        required
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"
        aria-describedby="{uid}-hint"
        aria-invalid={problem ? 'true' : undefined}
      />
      {#if problem}
        <span class="hint error" id="{uid}-hint" role="alert">{problem}</span>
      {:else}
        <span class="hint" id="{uid}-hint">Lowercase letters, digits and _, such as {example}.</span>
      {/if}
    </div>
    {#if kinds}
      <div class="field">
        <span id="{uid}-kind">Kind</span>
        <KindSelect
          aria-labelledby="{uid}-kind"
          aria-describedby={kindProblem ? `${uid}-kind-problem` : undefined}
          aria-invalid={kindProblem ? 'true' : undefined}
          value={kind}
          options={kinds}
          placeholder="Choose a kind"
          onchange={(k: string) => {
            kind = k;
            kindProblem = '';
          }}
        />
        {#if kindProblem}<span class="hint error" id="{uid}-kind-problem" role="alert">{kindProblem}</span>{/if}
      </div>
    {/if}
    <div class="buttons">
      <button type="button" class="quiet" onclick={() => dialog?.close()}>Cancel</button>
      <button class="primary">Add</button>
    </div>
  </form>
</dialog>

<style>
  input {
    font-family: var(--code-font);
  }
</style>
