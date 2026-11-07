<script lang="ts">
  // The model's text in CodeMirror, under a bar to find, fold and jump in it.
  // Loaded on demand: it's about as big as the rest of the app.
  import { autocompletion } from '@codemirror/autocomplete';
  import {
    defaultKeymap,
    history,
    historyKeymap,
    indentWithTab,
    isolateHistory,
    redo as redoEdit,
    redoDepth,
    undo as undoEdit,
    undoDepth,
  } from '@codemirror/commands';
  import { bracketMatching, foldAll, foldGutter, foldKeymap, indentOnInput, unfoldAll } from '@codemirror/language';
  import { linter, lintGutter } from '@codemirror/lint';
  import {
    closeSearchPanel,
    findNext,
    findPrevious,
    getSearchQuery,
    openSearchPanel,
    search,
    searchPanelOpen,
    SearchQuery,
    setSearchQuery,
  } from '@codemirror/search';
  import { EditorState } from '@codemirror/state';
  import { drawSelection, EditorView, highlightActiveLine, keymap } from '@codemirror/view';
  import { ChevronDown, ChevronUp, FoldVertical, Search, UnfoldVertical } from '@lucide/svelte';
  import { untrack, type Snippet } from 'svelte';
  import type { Problem } from '../lib/check';
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
    /** How many steps undo and redo can take, as that changes. */
    onhistory: (undo: number, redo: number) => void;
    /** Once the editor is up, so edits from outside go into its history. */
    onready: () => void;
    /** Where a thing is defined, to jump to from where it's referred to. */
    definition: (id: string) => { from: number; to: number } | null;
    /** More of the bar, after the editor's own. */
    tools?: Snippet;
  }
  let { text, onchange, lint, things, reveal, onhistory, onready, definition, tools }: Props = $props();
  const uid = $props.id();

  /** Undo and redo from outside the editor, such as the header's buttons. */
  export const undo = () => view && undoEdit(view);
  export const redo = () => view && redoEdit(view);

  let view: EditorView | undefined;
  // The text as the editor last had it, to tell a change from outside.
  let last = untrack(() => text);

  $effect(() => {
    if (view && text !== last) replace(view, text);
  });

  $effect(() => {
    if (view && reveal) show(view, reveal.from, reveal.to);
  });

  function show(view: EditorView, from: number, to: number) {
    const len = view.state.doc.length;
    [from, to] = [Math.min(from, len), Math.min(to, len)];
    view.dispatch({ selection: { anchor: from, head: to }, effects: EditorView.scrollIntoView(from, { y: 'center' }) });
  }

  /** Jumps from an id at `pos` to where it's defined, if it's a thing's and that's elsewhere. */
  function goToDefinition(view: EditorView, pos: number): boolean {
    const word = view.state.wordAt(pos);
    const at = word && definition(view.state.sliceDoc(word.from, word.to));
    if (!at || (at.from <= pos && pos <= at.to)) return false;
    show(view, at.from, at.to);
    return true;
  }
  const MAC = /Mac|iPhone|iPad/.test(navigator.userAgent);

  // Finding. The search package's own panel would sit in the shadow root, out
  // of app.css's reach, so it gets an empty one (its matches show only while a
  // panel is open) and the field is in the bar.
  let findField = $state<HTMLInputElement>();
  let query = $state('');
  /** The match selected and how many there are, while matches show. */
  let found = $state({ shown: false, at: 0, of: 0 });
  const hiddenPanel = () => {
    const dom = document.createElement('div');
    dom.hidden = true;
    return { dom };
  };

  /** Shows every match of `q`. */
  function arm(view: EditorView, q: string): SearchQuery {
    if (!searchPanelOpen(view.state)) openSearchPanel(view);
    const sq = new SearchQuery({ search: q, literal: true });
    view.dispatch({ effects: setSearchQuery.of(sq) });
    return sq;
  }

  /** Finds `q` from the selection on, as it's typed; an empty one shows nothing. */
  function find(q: string) {
    query = q;
    if (!view) return;
    if (!q) {
      closeSearchPanel(view);
      return;
    }
    const sq = arm(view, q);
    const next = sq.getCursor(view.state, view.state.selection.main.from).next();
    const first = next.done ? sq.getCursor(view.state).next() : next;
    if (!first.done) show(view, first.value.from, first.value.to);
  }

  /** To the next match, or back to the one before. */
  function step(back: boolean): boolean {
    if (!view || !query) return false;
    if (!searchPanelOpen(view.state)) arm(view, query);
    return (back ? findPrevious : findNext)(view);
  }
  const stepKey = (back: boolean) => () => step(back) || !!query;

  /** Mod-F: to the field, with the selection to find if it's on one line. */
  function toFind(view: EditorView): boolean {
    const { from, to } = view.state.selection.main;
    const picked = view.state.sliceDoc(from, to);
    if (picked && !picked.includes('\n')) find(picked);
    else if (query) find(query);
    findField?.focus();
    findField?.select();
    return true;
  }

  function findKeys(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      step(e.shiftKey);
    } else if (e.key === 'Escape' && view) {
      e.preventDefault();
      closeSearchPanel(view);
      view.focus();
    }
  }

  /** Which match is selected, of how many (up to 1000). */
  function count(state: EditorState): typeof found {
    const q = getSearchQuery(state);
    if (!searchPanelOpen(state) || !q.valid) return { shown: false, at: 0, of: 0 };
    const { from, to } = state.selection.main;
    let [at, of] = [0, 0];
    const cursor = q.getCursor(state);
    for (let m = cursor.next(); !m.done && of < 1000; m = cursor.next()) {
      of++;
      if (m.value.from === from && m.value.to === to) at = of;
    }
    return { shown: true, at, of };
  }
  const total = (n: number) => (n >= 1000 ? '1000+' : String(n));
  const plural = (n: number) => (n === 1 ? '1 match' : `${total(n)} matches`);

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
          // Already focusable as contenteditable; axe only counts it as such with a tabindex.
          EditorView.contentAttributes.of({ 'aria-label': 'Model text', tabindex: '0' }),
          lintGutter(),
          foldGutter(),
          search({ createPanel: hiddenPanel, scrollToMatch: (r) => EditorView.scrollIntoView(r, { y: 'center' }) }),
          autocompletion({ override: [completeIds(things)] }),
          linter((v) => lint(v.state.doc.toString()), { delay: 300 }),
          keymap.of([
            { key: 'Mod-f', run: toFind },
            { key: 'F3', run: stepKey(false), shift: stepKey(true) },
            { key: 'Mod-g', run: stepKey(false), shift: stepKey(true) },
            { key: 'Escape', run: (v) => searchPanelOpen(v.state) && closeSearchPanel(v) },
            { key: 'F12', run: (v) => goToDefinition(v, v.state.selection.main.head) },
            ...foldKeymap,
            ...defaultKeymap,
            ...historyKeymap,
            indentWithTab,
          ]),
          EditorView.domEventHandlers({
            mousedown: (e, v) => {
              if (!(MAC ? e.metaKey : e.ctrlKey)) return false;
              const pos = v.posAtCoords({ x: e.clientX, y: e.clientY });
              if (pos === null || !goToDefinition(v, pos)) return false;
              e.preventDefault();
              return true;
            },
          }),
          EditorView.updateListener.of((u) => {
            if (u.transactions.length) onhistory(undoDepth(u.state), redoDepth(u.state));
            const searched =
              getSearchQuery(u.state) !== getSearchQuery(u.startState) ||
              searchPanelOpen(u.state) !== searchPanelOpen(u.startState);
            if (searched || u.docChanged || u.selectionSet) found = count(u.state);
            if (!u.docChanged) return;
            last = u.state.doc.toString();
            onchange(last);
          }),
        ],
      }),
    });
    view = cm;
    onready();
    return () => cm.destroy();
  }
</script>

<div class="text">
  <div class="bar">
    <div class="find">
      <label class="field inline">
        <Search aria-hidden="true" /><span class="wide-only">Find</span>
        <input
          type="search"
          bind:this={findField}
          value={query}
          oninput={(e) => find(e.currentTarget.value)}
          onkeydown={findKeys}
          aria-describedby="{uid}-found"
          aria-keyshortcuts="Control+F Meta+F"
        />
      </label>
      <button class="quiet icon" aria-label="Previous match" disabled={!found.of} onclick={() => step(true)}
        ><ChevronUp /></button
      >
      <button class="quiet icon" aria-label="Next match" disabled={!found.of} onclick={() => step(false)}
        ><ChevronDown /></button
      >
      <span id="{uid}-found" class="muted found" role="status"
        >{#if found.shown}{found.at
            ? `${found.at} of ${total(found.of)}`
            : found.of
              ? plural(found.of)
              : 'No matches'}{/if}</span
      >
    </div>
    <div class="tools">
      <button class="quiet icon" aria-label="Fold all" title="Fold all" onclick={() => view && foldAll(view)}
        ><FoldVertical /></button
      >
      <button class="quiet icon" aria-label="Unfold all" title="Unfold all" onclick={() => view && unfoldAll(view)}
        ><UnfoldVertical /></button
      >
      {@render tools?.()}
    </div>
  </div>
  <div class="editor" {@attach editor}></div>
</div>

<style>
  .text {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    height: 100%;
  }
  .bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-1) var(--space-2);
    padding: var(--space-1) var(--space-2);
    border-bottom: 1px solid var(--border);
  }
  .find,
  .tools {
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }
  .find {
    flex: 1 1 18rem;
  }
  .find label,
  .find input {
    flex: 1;
    min-width: 0;
  }
  /* Kept to the right when it wraps. */
  .tools {
    margin-left: auto;
  }
  .found {
    min-width: 5em;
    font-size: var(--text-sm);
    white-space: nowrap;
  }
  .editor {
    min-width: 0;
    overflow: hidden;
  }
</style>
