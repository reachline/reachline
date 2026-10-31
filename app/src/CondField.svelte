<script lang="ts">
  // A condition (needs, access, recovery) as one line of text. The word at the
  // caret is completed from the model, which a datalist can't do: it matches
  // the whole value. Applied on change, as other fields are: a mistake is
  // explained and the text kept to fix, and ids that aren't things yet can
  // be created.
  import { CondError, fmtCond, parseCond, UNKNOWN, words } from '../../engine/cond.ts';
  import { suggest, wordAt } from './complete';
  import { idProblem, type Created } from './edit';
  import NewThings from './NewThings.svelte';
  import Tip from './Tip.svelte';

  interface Props {
    label: string;
    hint: string;
    /** The field as written. */
    value: unknown;
    ids: Map<string, string>;
    /** Whether `unknown` may appear. */
    unknown?: boolean;
    onchange: (value: string | null, created: Created[]) => void;
  }
  let { label, hint, value, ids, unknown = false, onchange }: Props = $props();

  const uid = $props.id();
  const written = $derived(typeof value === 'string' ? value : '');
  let input = $state<HTMLInputElement>();
  let options = $state<string[]>([]);
  let active = $state(-1);
  let problem = $state('');
  // Ids to create, each waiting for its kind, and the condition that needs them.
  let missing = $state<string[]>([]);
  let pending = '';

  const caret = () => input!.selectionStart ?? input!.value.length;

  function complete() {
    const { from } = wordAt(input!.value, caret());
    const word = input!.value.slice(from, caret());
    options = word ? suggest(word, [...ids.keys(), ...(unknown ? [UNKNOWN] : [])]).slice(0, 8) : [];
    active = -1;
  }

  function pick(id: string) {
    const { from, to } = wordAt(input!.value, caret());
    input!.value = input!.value.slice(0, from) + id + input!.value.slice(to);
    input!.setSelectionRange(from + id.length, from + id.length);
    options = [];
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
    } else if (e.key === 'Enter') {
      e.preventDefault();
      apply();
    }
  }

  function apply() {
    options = [];
    problem = '';
    missing = [];
    const text = input!.value.trim();
    if (!text) {
      if (written) onchange(null, []);
      return;
    }
    let c;
    try {
      c = parseCond(text);
    } catch (e) {
      if (!(e instanceof CondError)) throw e;
      problem = e.message;
      return;
    }
    const named = [...new Set(words(text).map((w) => w.text))];
    if (!unknown && named.includes(UNKNOWN)) {
      problem = `${UNKNOWN} can't be in ${label.toLowerCase()}; say what isn't known in To do.`;
      return;
    }
    const fresh = named.filter((id) => id !== UNKNOWN && !ids.has(id));
    const bad = fresh.find(idProblem);
    if (bad) {
      problem = `${bad} isn't a thing, and can't be one. ${idProblem(bad)}`;
      return;
    }
    pending = fmtCond(c);
    if (fresh.length) missing = fresh;
    else commit([]);
  }

  function commit(created: Created[]) {
    missing = [];
    if (pending !== written) onchange(pending, created);
    // The canonical text, even when that's what was there.
    input!.value = pending;
  }
</script>

<div class="field">
  <span><label for="{uid}-input">{label}</label><Tip id="{uid}-hint" about={label} text={hint} /></span>
  <div class="combo">
    <input
      bind:this={input}
      id="{uid}-input"
      value={written}
      role="combobox"
      aria-autocomplete="list"
      aria-expanded={options.length > 0}
      aria-controls="{uid}-list"
      aria-activedescendant={active >= 0 ? `${uid}-option-${active}` : undefined}
      aria-describedby="{uid}-hint{problem ? ` ${uid}-problem` : ''}"
      aria-invalid={problem ? 'true' : undefined}
      autocomplete="off"
      autocapitalize="off"
      spellcheck="false"
      oninput={complete}
      {onkeydown}
      onchange={apply}
      onblur={() => (options = [])}
    />
    <ul
      class="listbox"
      id="{uid}-list"
      role="listbox"
      aria-label={`Things for ${label.toLowerCase()}`}
      hidden={!options.length}
    >
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
          {id}<span class="muted">{id === UNKNOWN ? 'not known' : ids.get(id)}</span>
        </li>
      {/each}
    </ul>
  </div>
  {#if problem}<span class="hint error" id="{uid}-problem" role="alert">{problem}</span>{/if}
  {#if missing.length}
    {#key missing.join()}
      <NewThings ids={missing} oncreate={commit} oncancel={() => (missing = [])} />
    {/key}
  {/if}
</div>

<style>
  input {
    width: 100%;
    font-family: var(--code-font);
  }
</style>
