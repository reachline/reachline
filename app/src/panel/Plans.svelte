<script lang="ts">
  // The panel's Plans tab: the plans that are on, in the order they apply
  // (in edit mode, each one's name and note), and what they change, against
  // the model alone.
  import { Trash } from '@lucide/svelte';
  import type { ScenarioChange } from '../../../engine/report.ts';
  import NameField from '../forms/NameField.svelte';
  import type { Off } from '../lib/edit';
  import Pane from './Pane.svelte';
  import Verdicts from './Verdicts.svelte';

  interface Props {
    /** The plans that are on, in order. */
    plans: { name: string; note: string }[];
    /** Whether the model has any plans at all. */
    any: boolean;
    /** Fields that more than one plan that's on sets. */
    overlaps: { at: string; plans: string[] }[];
    /** Verdicts with the plans that are on, against without them; null while they can't be compared. */
    comparison: ScenarioChange[] | null;
    /** Whether the text loads, so plans can be changed. */
    editable: boolean;
    /** Why the plans that are on don't load with the model, if they don't. */
    error: string;
    edit: boolean;
    onedit: (on: boolean) => void;
    off: Off;
    onapply: (name: string) => void;
    ondelete: (name: string) => void;
    onrename: (from: string, to: string) => string;
    onnote: (name: string, note: string) => void;
  }
  let {
    plans,
    any,
    overlaps,
    comparison,
    editable,
    error,
    edit,
    onedit,
    off,
    onapply,
    ondelete,
    onrename,
    onnote,
  }: Props = $props();

  const uid = $props.id();
  const one = $derived(plans.length === 1);
</script>

<Pane
  name={plans.length ? plans.map((p) => p.name).join(' + ') : undefined}
  kind={one ? 'plan' : 'plans'}
  {edit}
  {editable}
  {onedit}
  {off}
>
  {#if error}
    <p class="notice" role="alert">
      The plans that are on don’t load with the model: {error}. Turn one off, or fix it in the text.
    </p>
  {:else if !editable && !edit && plans.length}
    <p class="notice" role="status">The text has errors, so plans can't be applied until they're fixed.</p>
  {/if}

  {#each plans as p (p.name)}
    <section aria-label={one ? 'Plan' : `Plan ${p.name}`}>
      {#if !one}<h3 class="mono">{p.name}</h3>{/if}
      {#if edit && editable}
        <div class="form">
          <NameField label="Name" value={p.name} onrename={(to: string) => onrename(p.name, to)} />
          <label class="field"
            >Note
            <textarea rows="2" value={p.note} onchange={(e) => onnote(p.name, e.currentTarget.value.trim())}></textarea>
          </label>
        </div>
      {:else if p.note}
        <p>{p.note}</p>
      {/if}
      <div class="buttons">
        <button disabled={!editable} onclick={() => onapply(p.name)}>Apply…</button>
        {#if edit}
          <button class="danger" disabled={!editable} onclick={() => ondelete(p.name)}><Trash />Delete {p.name}</button>
        {/if}
      </div>
    </section>
  {:else}
    <section>
      <p class="muted">
        A plan is a what-if over the model. Those that are on show in the graph, applied in the order they're written;
        applying one makes it part of the model.
      </p>
      <p class="muted">
        {any ? 'Turn one on from Plans above the graph to see what it changes.' : 'Add one from Add.'}
      </p>
    </section>
  {/each}

  {#if overlaps.length}
    <p class="notice" role="status">
      Plans that are on set the same fields, so the later one's wins:
      {overlaps.map((o) => `${o.at} (${o.plans.join(', ')})`).join('; ')}.
    </p>
  {/if}

  {#if plans.length && comparison}
    <section aria-labelledby="{uid}-compare">
      <h3 id="{uid}-compare">What {one ? 'it changes' : 'they change'}</h3>
      <Verdicts changes={comparison} />
    </section>
  {/if}
</Pane>

<style>
  .form {
    display: grid;
    gap: var(--space-4);
    margin-bottom: var(--space-2);
  }
  .buttons {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
</style>
