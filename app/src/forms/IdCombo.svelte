<script lang="ts">
  // A text field for thing ids, suggesting them from the model as you type,
  // each with its kind. It completes the whole value, or with `word` the word
  // at the caret, as in a condition. Other attributes go to the <input>.
  import type { HTMLInputAttributes } from 'svelte/elements';
  import { UNKNOWN } from '../../../engine/cond.ts';
  import { suggest, wordAt } from '../panel/complete';
  import KindIcon from '../shell/KindIcon.svelte';

  interface Props extends Omit<HTMLInputAttributes, 'value'> {
    value?: string;
    /** Every thing, id to kind. */
    ids: Map<string, string>;
    /** Names the list of suggestions. */
    listLabel: string;
    /** Suggests states only. */
    states?: boolean;
    /** Suggests `unknown` too. */
    unknown?: boolean;
    word?: boolean;
    /** After a suggestion is picked, with the field's new value. */
    onpick?: (value: string) => void;
    /** Enter with no suggestion chosen; without it, Enter does what it would (submits the form). */
    onenter?: () => void;
  }
  let {
    value = $bindable(''),
    ids,
    listLabel,
    states = false,
    unknown = false,
    word = false,
    onpick,
    onenter,
    ...rest
  }: Props = $props();

  const uid = $props.id();
  let input = $state<HTMLInputElement>();
  let options = $state<string[]>([]);
  let active = $state(-1);

  const caret = () => input!.selectionStart ?? value.length;
  const span = () => (word ? wordAt(value, caret()) : { from: 0, to: value.length });

  function complete() {
    const typed = value.slice(span().from, caret());
    const pool = [...ids].filter(([, k]) => !states || k === 'state').map(([id]) => id);
    options = typed ? suggest(typed, unknown ? [...pool, UNKNOWN] : pool).slice(0, 8) : [];
    active = -1;
  }

  function pick(id: string) {
    const { from, to } = span();
    // Set on the element too, so the caret can go after the id now.
    value = input!.value = value.slice(0, from) + id + value.slice(to);
    input!.setSelectionRange(from + id.length, from + id.length);
    options = [];
    onpick?.(value);
  }

  function onkeydown(e: KeyboardEvent) {
    const open = options.length > 0;
    if (open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : options.length - 1;
      active = (Math.max(active, e.key === 'ArrowDown' ? -1 : 0) + step) % options.length;
    } else if (open && active >= 0 && (e.key === 'Enter' || e.key === 'Tab')) {
      e.preventDefault();
      pick(options[active]);
    } else if (open && e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      options = [];
    } else if (e.key === 'Enter' && onenter) {
      e.preventDefault();
      options = [];
      onenter();
    }
  }
</script>

<div class="combo">
  <input
    bind:this={input}
    bind:value
    {...rest}
    role="combobox"
    aria-autocomplete="list"
    aria-expanded={options.length > 0}
    aria-controls="{uid}-list"
    aria-activedescendant={options[active] ? `${uid}-option-${active}` : undefined}
    autocomplete="off"
    autocapitalize="off"
    spellcheck="false"
    oninput={complete}
    {onkeydown}
    onblur={() => (options = [])}
  />
  <ul class="listbox" id="{uid}-list" role="listbox" aria-label={listLabel} hidden={!options.length}>
    {#each options as id, i (id)}
      <!-- Pressed, not clicked, so the field keeps its focus; the keyboard picks with the arrows and Enter. -->
      <li
        id="{uid}-option-{i}"
        role="option"
        aria-selected={i === active}
        onpointerdown={(e) => {
          e.preventDefault();
          pick(id);
        }}
      >
        <KindIcon kind={ids.get(id)} />{id}<span class="muted">{id === UNKNOWN ? 'not known' : ids.get(id)}</span>
      </li>
    {/each}
  </ul>
</div>

<style>
  .combo {
    min-width: 0;
  }
  input {
    width: 100%;
    font-family: var(--code-font);
  }
</style>
