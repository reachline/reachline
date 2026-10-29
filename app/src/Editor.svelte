<script lang="ts">
  // The model's text in CodeMirror. Loaded on demand: it's about as big as the
  // rest of the app.
  import { autocompletion } from '@codemirror/autocomplete';
  import { defaultKeymap, history, historyKeymap, indentWithTab, isolateHistory } from '@codemirror/commands';
  import { bracketMatching, indentOnInput } from '@codemirror/language';
  import { linter, lintGutter } from '@codemirror/lint';
  import { EditorState } from '@codemirror/state';
  import { drawSelection, EditorView, highlightActiveLine, keymap } from '@codemirror/view';
  import { untrack } from 'svelte';
  import type { Problem } from './check';
  import { base, shadowView } from './codemirror';
  import { completeIds } from './complete';

  interface Props {
    /** Set from outside, it replaces the text as one edit, which undo can take back. */
    text: string;
    onchange: (text: string) => void;
    /** Checks the text after edits settle, and gives the problems to mark. */
    lint: (text: string) => Problem[];
    /** Ids and kinds to complete. */
    things: () => Iterable<[string, string]>;
    /** Text to select and scroll to; a new object each time. */
    reveal: { from: number; to: number } | null;
  }
  let { text, onchange, lint, things, reveal }: Props = $props();

  let view: EditorView | undefined;
  // The text as the editor last had it, to tell a change from outside.
  let last = untrack(() => text);

  $effect(() => {
    if (view && text !== last) replace(view, text);
  });

  $effect(() => {
    if (!view || !reveal) return;
    const len = view.state.doc.length;
    const [from, to] = [Math.min(reveal.from, len), Math.min(reveal.to, len)];
    view.dispatch({ selection: { anchor: from, head: to }, effects: EditorView.scrollIntoView(from, { y: 'center' }) });
  });

  /** Changes only what differs, so the cursor and the rest of the text stay put. */
  function replace(view: EditorView, text: string) {
    const old = view.state.doc.toString();
    let a = 0;
    while (a < old.length && a < text.length && old[a] === text[a]) a++;
    let b = 0;
    while (b < old.length - a && b < text.length - a && old[old.length - 1 - b] === text[text.length - 1 - b]) b++;
    view.dispatch({
      changes: { from: a, to: old.length - b, insert: text.slice(a, text.length - b) },
      // Its own undo step, never merged with typing just before or after.
      annotations: isolateHistory.of('full'),
    });
  }

  function editor(host: HTMLElement) {
    const cm = shadowView(host, {
      state: EditorState.create({
        doc: untrack(() => text),
        extensions: [
          base,
          highlightActiveLine(),
          drawSelection(),
          history(),
          indentOnInput(),
          bracketMatching(),
          lintGutter(),
          autocompletion({ override: [completeIds(things)] }),
          linter((v) => lint(v.state.doc.toString()).map((p) => ({ ...p, severity: 'error' })), { delay: 300 }),
          keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
          EditorView.updateListener.of((u) => {
            if (!u.docChanged) return;
            last = u.state.doc.toString();
            onchange(last);
          }),
        ],
      }),
    });
    view = cm;
    return () => cm.destroy();
  }
</script>

<div class="editor" {@attach editor}></div>

<style>
  .editor {
    height: 100%;
    min-width: 0;
    overflow: hidden;
  }
</style>
