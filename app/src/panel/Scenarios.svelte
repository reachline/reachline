<script lang="ts">
  // The panel's Scenarios tab: every scenario, and the chosen one's verdicts
  // as the CLI reports them, then what else it leaves worse off. In edit mode,
  // the chosen one's form.
  import { Plus } from '@lucide/svelte';
  import { BASELINE, type Row, type Scenario } from '../../../engine/model.ts';
  import type { Model, Outcome } from '../lib/data';
  import type { Created, Editing } from '../lib/edit';
  import EditBar from '../forms/EditBar.svelte';
  import FromPlan from '../forms/FromPlan.svelte';
  import ScenarioForm from '../forms/ScenarioForm.svelte';
  import Tip from '../shell/Tip.svelte';

  interface Props {
    model: Model | null;
    scenario: Outcome | undefined;
    scenarioName: string;
    onchoose: (name: string) => void;
    edit: boolean;
    /** Null while the text doesn't load. */
    editing: Editing | null;
    onedit: (on: boolean) => void;
    onadd: () => void;
    /** Why the forms are off while editing is null, and what fixes it. */
    off: { why: string; fix: string; onfix: () => void };
  }
  let { model, scenario, scenarioName, onchoose, edit, editing, onedit, onadd, off }: Props = $props();

  const uid = $props.id();

  // The normal day, then lockouts, then breaches.
  const list = $derived(
    [...(model?.scenarios ?? [])].sort(
      ([a, x], [b, y]) => +(b === BASELINE) - +(a === BASELINE) || +(x.kind === 'breach') - +(y.kind === 'breach'),
    ),
  );

  function summary(name: string, sc: Scenario): string {
    if (name === BASELINE) return 'the normal day: you, with nothing lost';
    const ids = ((sc.kind === 'lockout' ? sc.lost : sc.attacker) ?? []).join(', ') || 'nothing';
    return sc.kind === 'lockout' ? `loses ${ids}` : `the attacker has ${ids}`;
  }

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

<div class="scenarios">
  <div class="top">
    <h2>Scenarios</h2>
    <span class="bar"><EditBar {edit} {editing} {onedit} /></span>
  </div>
  {#if edit && !editing}
    <p class="notice" role="status">
      {off.why}, so the forms are off until that's fixed. <button onclick={off.onfix}>{off.fix}</button>
    </p>
  {/if}

  <section>
    <ul class="list">
      {#each list as [name, sc] (name)}
        <li>
          <button class="quiet" aria-pressed={name === scenarioName} onclick={() => onchoose(name)}>
            <span><span class="mono name">{name}</span> <span class="muted">{sc.kind}</span></span>
            <span class="muted">{summary(name, sc)}</span>
          </button>
        </li>
      {/each}
    </ul>
    {#if edit}
      <div><button class="quiet" disabled={!editing} onclick={onadd}><Plus />Add a scenario…</button></div>
    {/if}
  </section>

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
        <h3><span class="mono">{scenarioName}</span> <span class="muted">{kind}</span></h3>
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
    <p class="muted">Choose a scenario to see what it does.</p>
  {/if}
</div>

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
  .scenarios {
    display: grid;
    align-content: start;
    gap: var(--space-4);
    height: 100%;
    overflow-y: auto;
    padding: var(--space-4);
  }
  .top {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    margin: calc(-1 * var(--space-2)) 0;
  }
  .top h2 {
    font-size: var(--text-md);
  }
  .bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
  }
  section {
    display: grid;
    gap: var(--space-2);
  }
  section + section {
    padding-top: var(--space-4);
    border-top: 1px solid var(--border);
  }
  .list,
  .rows {
    display: grid;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .list {
    gap: 2px;
  }
  .list button {
    display: grid;
    justify-content: start;
    justify-items: start;
    width: 100%;
    padding: var(--space-1) var(--space-2);
    text-align: left;
    white-space: normal;
  }
  .name {
    font-weight: 600;
  }
  h3 {
    overflow-wrap: anywhere;
  }
  .rows {
    gap: var(--space-1);
    font-size: var(--text-sm);
  }
  .bad {
    color: var(--danger);
  }
  .shaky {
    color: var(--warning);
  }
</style>
