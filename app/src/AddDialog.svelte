<script lang="ts">
  // Asks for a name and a kind: a new thing, or a new scenario.
  import { idProblem } from './edit';

  interface Props {
    title: string;
    kinds: readonly string[];
    /** Whether a name is already in use. */
    taken: (name: string) => boolean;
    onadd: (name: string, kind: string) => void;
    /** The <dialog>, for its owner to open with showModal(). */
    dialog?: HTMLDialogElement;
  }
  let { title, kinds, taken, onadd, dialog = $bindable() }: Props = $props();

  const uid = $props.id();
  let name = $state('');
  let kind = $state('');
  let problem = $state('');

  // Each time it opens, it starts empty.
  function reset() {
    name = '';
    kind = '';
    problem = '';
  }

  function submit(e: SubmitEvent) {
    e.preventDefault();
    const n = name.trim();
    problem = idProblem(n);
    if (problem) return;
    if (taken(n)) problem = `${n} is already taken.`;
    else {
      dialog?.close();
      onadd(n, kind);
    }
  }
</script>

<dialog bind:this={dialog} aria-labelledby="{uid}-title" onclose={reset}>
  <form class="body" onsubmit={submit}>
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
        <span class="hint" id="{uid}-hint">Lowercase letters, digits and _, such as mail_pw.</span>
      {/if}
    </div>
    <label class="field"
      >Kind
      <select bind:value={kind} required>
        <option value="" disabled>Choose a kind</option>
        {#each kinds as k (k)}<option value={k}>{k}</option>{/each}
      </select>
    </label>
    <div class="buttons">
      <button type="button" class="quiet" onclick={() => dialog?.close()}>Cancel</button>
      <button class="primary">Add</button>
    </div>
  </form>
</dialog>

<style>
  .body {
    display: grid;
    gap: var(--space-4);
    padding: var(--space-5);
  }
  h2 {
    font-size: var(--text-lg);
  }
  input {
    font-family: var(--code-font);
  }
  .buttons {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
  }
</style>
