<script lang="ts">
  // Asks before an action, opening whenever there's a question. What more it
  // shows, such as what the action would change, is its children.
  import type { Snippet } from 'svelte';
  import type { Question } from './confirm';

  interface Props {
    question: Question | null | undefined;
    onconfirm: () => void;
    /** Closed, by going ahead or not: the owner drops the question. */
    onclose: () => void;
    children?: Snippet;
  }
  let { question, onconfirm, onclose, children }: Props = $props();

  const uid = $props.id();
  let dialog = $state<HTMLDialogElement>();

  $effect(() => {
    if (question && dialog && !dialog.open) dialog.showModal();
  });
</script>

<dialog bind:this={dialog} aria-labelledby="{uid}-title" aria-describedby="{uid}-text" {onclose}>
  {#if question}
    <div>
      <h2 id="{uid}-title">{question.title}</h2>
      <p id="{uid}-text">{question.text}</p>
      {@render children?.()}
      <div class="buttons">
        <button class="quiet" onclick={() => dialog?.close()}>Cancel</button>
        <button
          class={question.danger === false ? 'primary' : 'danger'}
          onclick={() => {
            onconfirm();
            dialog?.close();
          }}>{question.action}</button
        >
      </div>
    </div>
  {/if}
</dialog>
