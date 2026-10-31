<script lang="ts">
  // The panel's Plans tab: each plan, on or off; the one edits go into; and
  // what the plans that are on change, against the model alone.
  import { Check, FilePlus, Pencil, Trash } from '@lucide/svelte';
  import type { ScenarioChange } from '../../engine/report.ts';
  import { validId, type Layer } from './edit';
  import NameField from './NameField.svelte';
  import Verdicts from './Verdicts.svelte';

  interface Props {
    plans: { name: string; note: string }[];
    on: string[];
    layer: Layer;
    /** Fields that more than one plan that's on sets. */
    overlaps: { at: string; plans: string[] }[];
    /** Verdicts with the plans that are on, against without them; null with none on. */
    comparison: ScenarioChange[] | null;
    /** Whether the text loads, so plans can be changed. */
    editable: boolean;
    onturn: (name: string, on: boolean) => void;
    /** Makes it where edits go (null: the model), and shows the forms. */
    onedit: (name: Layer) => void;
    onapply: (name: string) => void;
    ondelete: (name: string) => void;
    oncreate: (name: string, note: string) => void;
    onrename: (from: string, to: string) => string;
    onnote: (name: string, note: string) => void;
  }
  let {
    plans,
    on,
    layer,
    overlaps,
    comparison,
    editable,
    onturn,
    onedit,
    onapply,
    ondelete,
    oncreate,
    onrename,
    onnote,
  }: Props = $props();

  const uid = $props.id();
  let name = $state('');
  let note = $state('');
  let problem = $state('');

  function create(e: SubmitEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!validId(n)) problem = 'Use lowercase letters, digits and _, starting with a letter.';
    else if (plans.some((p) => p.name === n)) problem = `${n} is already a plan.`;
    else {
      oncreate(n, note.trim());
      name = note = problem = '';
    }
  }
</script>

<div class="plans">
  <section>
    <h2>Plans</h2>
    <p class="muted">
      What-ifs over the model. The ones that are on show in the graph, in the order they're listed; applying one makes
      it part of the model.
    </p>
    {#if !editable}<p class="notice" role="status">
        The text has errors, so plans can't be changed until they're fixed.
      </p>{/if}
    {#if plans.length}
      <ul class="list">
        {#each plans as p (p.name)}
          <li class="card plan" class:target={layer === p.name}>
            <label class="check"
              ><input
                type="checkbox"
                checked={on.includes(p.name)}
                disabled={!editable}
                onchange={(e) => onturn(p.name, e.currentTarget.checked)}
              /><span class="mono">{p.name}</span></label
            >
            {#if layer === p.name}
              <p class="muted"><Check /> Edits go into this plan.</p>
              <NameField label="Name" value={p.name} onrename={(to: string) => onrename(p.name, to)} />
              <label class="field"
                >Note
                <textarea rows="2" value={p.note} onchange={(e) => onnote(p.name, e.currentTarget.value.trim())}
                ></textarea>
              </label>
            {:else if p.note}
              <p>{p.note}</p>
            {/if}
            <div class="buttons">
              {#if layer === p.name}
                <button class="quiet" onclick={() => onedit(null)}>Edit the model instead</button>
              {:else}
                <button class="quiet" disabled={!editable} onclick={() => onedit(p.name)}><Pencil />Edit</button>
              {/if}
              <button class="quiet" disabled={!editable} onclick={() => onapply(p.name)}>Apply…</button>
              <button class="quiet danger" disabled={!editable} onclick={() => ondelete(p.name)}
                ><Trash />Delete…</button
              >
            </div>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="muted">No plans yet.</p>
    {/if}
  </section>

  {#if overlaps.length}
    <section>
      <p class="notice" role="status">
        Plans that are on set the same fields, so the later one's wins:
        {overlaps.map((o) => `${o.at} (${o.plans.join(', ')})`).join('; ')}.
      </p>
    </section>
  {/if}

  <section aria-labelledby="{uid}-compare">
    <h2 id="{uid}-compare">What the plans that are on change</h2>
    {#if comparison}
      <Verdicts changes={comparison} />
    {:else}
      <p class="muted">Turn a plan on to see what it changes, scenario by scenario.</p>
    {/if}
  </section>

  <section>
    <form class="new" onsubmit={create} aria-labelledby="{uid}-new">
      <h2 id="{uid}-new">New plan</h2>
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
          <span class="hint" id="{uid}-hint">Such as spare_key. It starts on, and edits go into it.</span>
        {/if}
      </div>
      <label class="field">Note <input bind:value={note} /></label>
      <div><button disabled={!editable}><FilePlus />Create plan</button></div>
    </form>
  </section>
</div>

<style>
  .plans {
    display: grid;
    align-content: start;
    gap: var(--space-4);
    height: 100%;
    overflow-y: auto;
    padding: var(--space-4);
  }
  section,
  .new {
    display: grid;
    gap: var(--space-2);
  }
  section + section {
    padding-top: var(--space-4);
    border-top: 1px solid var(--border);
  }
  h2 {
    font-size: var(--text-md);
  }
  .list {
    display: grid;
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .plan {
    display: grid;
    gap: var(--space-2);
    padding: var(--space-3);
  }
  .plan.target {
    border-color: var(--accent);
  }
  .check {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-weight: 600;
  }
  .buttons {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
  }
  .new input:not([type]) {
    font-family: var(--code-font);
  }
</style>
