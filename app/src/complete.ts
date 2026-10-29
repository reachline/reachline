// Completing thing ids where the text refers to things, from the last model
// that loaded.
import type { CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import type { EditorState } from '@codemirror/state';

/** Fields whose values are thing ids; `assume` and `deny` take states only. */
const REFS = new Set(['in', 'needs', 'access', 'recovery', 'of', 'by', 'lost', 'attacker', 'me']);
const STATES = new Set(['assume', 'deny']);

/** The field whose value `pos` is in, or null in a key. */
export function fieldAt(state: EditorState, pos: number): string | null {
  // Parsing runs in slices, so the tree may not reach the cursor yet.
  const tree = ensureSyntaxTree(state, pos, 100) ?? syntaxTree(state);
  for (let n = tree.resolveInner(pos, -1).parent; n; n = n.parent) {
    if (n.name !== 'Pair') continue;
    const key = n.getChild('Key');
    if (!key) continue;
    if (pos < key.from || pos > key.to) return state.sliceDoc(key.from, key.to);
    // A list still being typed, like `[a, b`, parses as an implicit mapping
    // without braces; its "key" is really a list item.
    const parent = n.parent;
    if (parent?.name === 'BlockMapping' || state.sliceDoc(parent?.from, (parent?.from ?? 0) + 1) === '{') return null;
  }
  return null;
}

/** Completes ids from `things` (id and kind) where a field takes them. */
export function completeIds(things: () => Iterable<[string, string]>) {
  return (ctx: CompletionContext): CompletionResult | null => {
    const word = ctx.matchBefore(/[\w.-]*/);
    if (!word || (word.from === word.to && !ctx.explicit)) return null;
    const field = fieldAt(ctx.state, ctx.pos);
    if (!field || !(REFS.has(field) || STATES.has(field))) return null;
    const options = [...things()]
      .filter(([, kind]) => !STATES.has(field) || kind === 'state')
      .map(([id, kind]) => ({ label: id, detail: kind }));
    return { from: word.from, options, validFor: /^[\w.-]*$/ };
  };
}
