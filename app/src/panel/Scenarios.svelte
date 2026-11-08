<script lang="ts">
  // The panel's Scenario tab: the scenario chosen in the toolbar (in edit
  // mode, its form), and its verdicts as the CLI reports them, then what else
  // it leaves worse off.
  import { BASELINE, type Row } from '../../../engine/model.ts';
  import { summary, type Model, type Outcome } from '../lib/data';
  import type { Created, Editing, Off } from '../lib/edit';
  import FromPlan from '../forms/FromPlan.svelte';
  import ScenarioForm from '../forms/ScenarioForm.svelte';
  import Tip from '../shell/Tip.svelte';
  import Pane from './Pane.svelte';

  interface Props {
    model: Model | null;
    scenario: Outcome | undefined;
    scenarioName: string;
    edit: boolean;
    /** Null while the text doesn't load. */
    editing: Editing | null;
    onedit: (on: boolean) => void;
    off: Off;
  }
  let { model, scenario, scenarioName, edit, editing, onedit, off }: Props = $props();

  const uid = $props.id();

  const kind = $derived(scenario?.sc.kind ?? 'lockout');
  const checked = $derived(!!model && [...model.things.values()].some((t) => t.check.includes(kind)));
  const also = $derived(scenario && model ? model.affected(scenarioName) : new Map<string, Row>());
  const heading = $derived(
    scenarioName === BASELINE
      ? 'Already shaky on a normal day'
      : kind === 'lockout'
        ? 'Worse off than on a normal day'
        : 'What the attacker gets',
  );
  const NONE = {
    lockout: 'Nothing is checked for lockouts: check what you’d hate to lose.',
    breach: 'Nothing is checked for breaches: check what you’d hate someone else to get.',
  };
  const OK = {
    normal: 'Everything checked for lockouts is reached outright.',
    lockout: 'Nothing checked is worse off than on a normal day.',
    breach: 'Nothing checked, beyond what anyone could guess at.',
  };

  // The normal day isn't written: its form edits only `me`.
  const spec = $derived(scenarioName === BASELINE ? { kind: 'lockout' } : editing?.written.scenarios[scenarioName]);
</script>

<Pane name={scenario ? scenarioName : undefined} {kind} {edit} editable={!!editing} {onedit} {off}>
  {#if scenario}
    <section aria-label="Scenario">
      {#if edit && editing && spec}
        {#if scenarioName !== BASELINE}<FromPlan {editing} section="scenarios" id={scenarioName} />{/if}
        {#key scenarioName}
          <ScenarioForm
            name={scenarioName}
            {spec}
            me={editing.written.me}
            ids={editing.ids}
            onset={(field: string, value: unknown, created?: Created[]) =>
              editing.setScenario(scenarioName, field, value, created)}
            onme={editing.setMe}
            onrename={(to: string) => editing.renameScenario(scenarioName, to)}
            ondelete={() => editing.deleteScenario(scenarioName)}
          />
        {/key}
      {:else}
        <p class="muted">{summary(scenarioName, scenario.sc)}</p>
        {#if scenario.sc.note}<p>{scenario.sc.note}</p>{/if}
      {/if}
    </section>

    <section aria-labelledby="{uid}-verdicts">
      <h3>
        <span id="{uid}-verdicts">{heading}</span><Tip
          id="{uid}-tip"
          about="what’s listed"
          text={`What’s checked for ${kind}s: what you care about for its own sake. The keys, devices and accounts that lead to it are under Also affected.`}
        />
      </h3>
      {#if !checked}
        <p class="muted">{NONE[kind]}</p>
      {:else if scenario.rows.size}
        {@render rows(scenario.rows)}
      {:else}
        <p class="muted">{OK[scenarioName === BASELINE ? 'normal' : kind]}</p>
      {/if}
      {#if also.size}
        <details>
          <summary>Also affected ({also.size})</summary>
          {@render rows(also)}
        </details>
      {/if}
    </section>
  {:else}
    <section>
      <p class="muted">Choose a scenario above the graph to see what it does, and add one from Add.</p>
    </section>
  {/if}
</Pane>

<!-- As the CLI lists them: the verdict's word first, then its assumptions, then the path the attacker takes. -->
{#snippet rows(rs: Map<string, Row>)}
  <ul class="rows">
    {#each rs as [t, [status, how]] (t)}
      {@const [word, ...rest] = status.split(/\s+/)}
      <li>
        <span class="mono">{t}</span>
        <b class={word === 'LOST' || word === 'REACHED' ? 'bad' : 'shaky'}>{word}</b>
        {rest.join(' ')}
        {#if how}<span class="mono muted">{how}</span>{/if}
      </li>
    {/each}
  </ul>
{/snippet}

<style>
  .rows {
    display: grid;
    gap: var(--space-1);
    margin: 0;
    padding: 0;
    font-size: var(--text-sm);
    list-style: none;
  }
  .bad {
    color: var(--danger);
  }
  .shaky {
    color: var(--warning);
  }
</style>
