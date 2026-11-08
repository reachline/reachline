<script lang="ts">
  // A condition (needs, access, recovery) as one line of text, completing the
  // word at the caret. Applied on change, as other fields are: a mistake is
  // explained and the text kept to fix, and ids that aren't things yet can
  // be created.
  import { CondError, fmtCond, parseCond, UNKNOWN, words } from '../../../engine/cond.ts';
  import { idProblem, type Created } from '../lib/edit';
  import IdCombo from './IdCombo.svelte';
  import NewThings from './NewThings.svelte';
  import Tip from '../shell/Tip.svelte';

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
  // What's typed, until the model's text changes.
  let text = $derived(written);
  let problem = $state('');
  // Ids to create, each waiting for its kind, and the condition that needs them.
  let missing = $state<string[]>([]);
  let pending = '';

  function apply() {
    problem = '';
    missing = [];
    const typed = text.trim();
    if (!typed) {
      if (written) onchange(null, []);
      return;
    }
    let c;
    try {
      c = parseCond(typed);
    } catch (e) {
      if (!(e instanceof CondError)) throw e;
      problem = e.message;
      return;
    }
    const named = [...new Set(words(typed).map((w) => w.text))];
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
    text = pending;
  }
</script>

<div class="field">
  <span><label for="{uid}-input">{label}</label><Tip id="{uid}-hint" about={label} text={hint} /></span>
  <IdCombo
    bind:value={text}
    {ids}
    {unknown}
    word
    listLabel={`Things for ${label.toLowerCase()}`}
    id="{uid}-input"
    aria-describedby="{uid}-hint{problem ? ` ${uid}-problem` : ''}"
    aria-invalid={problem ? 'true' : undefined}
    onchange={apply}
    onenter={apply}
  />
  {#if problem}<span class="hint error" id="{uid}-problem" role="alert">{problem}</span>{/if}
  {#if missing.length}
    {#key missing.join()}
      <NewThings ids={missing} oncreate={commit} oncancel={() => (missing = [])} />
    {/key}
  {/if}
</div>
