<script lang="ts">
  // A model's revisions, newest first: each compared with the text as it is
  // now, and restored by saving its text again. Loaded on demand.
  import { unifiedMergeView } from '@codemirror/merge';
  import { EditorState } from '@codemirror/state';
  import { EditorView } from '@codemirror/view';
  import type { RevisionSummary } from '../../server/api.ts';
  import { api, message } from './api';
  import { base, shadowView } from './codemirror';

  interface Props {
    id: number;
    /** The latest revision; the list reloads when it changes. */
    latest: number;
    /** The text as it is now, saved or not. */
    current: string;
    onrestore: (text: string) => void;
  }
  let { id, latest, current, onrestore }: Props = $props();

  let revisions = $state<RevisionSummary[] | null>(null);
  let chosen = $state<number | null>(null);
  let text = $state<string | null>(null); // the chosen revision's
  let error = $state('');

  $effect(() => {
    void latest;
    api.revisions(id).then(
      (r) => {
        revisions = r;
        chosen ??= r[0]?.id ?? null;
      },
      (e: unknown) => (error = message(e)),
    );
  });

  $effect(() => {
    const rev = chosen;
    text = null;
    if (rev === null) return;
    let live = true;
    api.revision(id, rev).then(
      (r) => live && (text = r.text),
      (e: unknown) => live && (error = message(e)),
    );
    return () => (live = false);
  });

  const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'medium' });

  /** The text as it is now, with what differs from `original` marked, and only the changed parts open. */
  function compare(original: string, now: string) {
    return (host: HTMLElement) => {
      const cm = shadowView(host, {
        state: EditorState.create({
          doc: now,
          extensions: [
            base,
            EditorState.readOnly.of(true),
            EditorView.editable.of(false),
            unifiedMergeView({ original, mergeControls: false, collapseUnchanged: { margin: 3, minSize: 4 } }),
          ],
        }),
      });
      return () => cm.destroy();
    };
  }
</script>

<div class="history">
  <ol class="list">
    {#each revisions ?? [] as r, i (r.id)}
      <li>
        <button class="quiet" aria-pressed={r.id === chosen} onclick={() => (chosen = r.id)}>
          {when(r.created)}{i === 0 ? ' (latest)' : ''}
        </button>
      </li>
    {/each}
  </ol>
  {#if error}
    <p class="head error" role="alert">{error}</p>
  {:else if text !== null}
    {@const old = text}
    <p class="head muted">
      {#if old === current}
        Same as the text now.
      {:else}
        What changed from this revision to the text now.
        <button onclick={() => onrestore(old)}>Restore this revision</button>
      {/if}
    </p>
    <div class="diff" {@attach compare(old, current)}></div>
  {/if}
</div>

<style>
  .history {
    display: grid;
    grid-template-rows: auto auto minmax(0, 1fr);
    height: 100%;
    background: var(--surface);
  }
  .list {
    max-height: 10rem;
    margin: 0;
    padding: 4px 0;
    overflow-y: auto;
    border-bottom: 1px solid var(--border);
    list-style: none;
  }
  .list button {
    width: 100%;
    justify-content: flex-start;
    border-radius: 0;
  }
  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 10px;
    margin: 0;
    padding: 6px 12px;
    border-bottom: 1px solid var(--border);
  }
  .diff {
    min-height: 0;
    overflow: hidden;
  }
</style>
