// What the editor and the history's comparison share: YAML, and colours from
// app.css so they follow the light and dark themes.
import { yaml } from '@codemirror/lang-yaml';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { EditorView, lineNumbers, type EditorViewConfig } from '@codemirror/view';
import { tags } from '@lezer/highlight';

const theme = EditorView.theme({
  '&': { height: '100%', color: 'var(--text)', backgroundColor: 'var(--surface)' },
  '.cm-scroller': { fontFamily: 'var(--code-font)', fontSize: 'var(--code-size)', lineHeight: '1.5' },
  '.cm-gutters': { color: 'var(--muted)', backgroundColor: 'var(--surface)', borderRight: '1px solid var(--border)' },
  '.cm-activeLine': { backgroundColor: 'var(--active-line)' },
  '.cm-activeLineGutter': { backgroundColor: 'var(--active-line)' },
  '.cm-cursor': { borderLeftColor: 'var(--text)' },
  // Doubled up to outrank CodeMirror's own light and dark styles.
  '&.cm-editor .cm-selectionBackground, &.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground': {
    backgroundColor: 'var(--selection)',
  },
  '&.cm-editor .cm-tooltip': {
    color: 'var(--text)',
    backgroundColor: 'var(--surface)',
    border: '1px solid var(--border)',
  },
  '&.cm-editor .cm-collapsedLines': { color: 'var(--muted)', background: 'var(--active-line)' },
});

const highlight = HighlightStyle.define([
  { tag: tags.definition(tags.propertyName), color: 'var(--syn-key)' },
  { tag: [tags.string, tags.special(tags.string)], color: 'var(--syn-string)' },
  { tag: [tags.lineComment, tags.separator, tags.meta], color: 'var(--muted)' },
]);

export const base = [lineNumbers(), yaml(), syntaxHighlighting(highlight), theme, EditorView.lineWrapping];

/**
 * A view in a shadow root under `host`. In the document CodeMirror adds its
 * styles as a <style> element, which the CSP blocks; in a shadow root it uses
 * a constructed stylesheet.
 */
export function shadowView(host: HTMLElement, config: Omit<EditorViewConfig, 'parent'>) {
  return new EditorView({ ...config, parent: host.shadowRoot ?? host.attachShadow({ mode: 'open' }) });
}
