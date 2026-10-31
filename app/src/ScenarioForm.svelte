<script lang="ts">
  // A scenario's fields, as written in the layer being edited. The normal day
  // is built in, so it has none: there it's what you have (`me`), which every
  // lockout starts from.
  import { Trash } from '@lucide/svelte';
  import { BASELINE, SCENARIO_KINDS } from '../../engine/model.ts';
  import type { Created } from './edit';
  import IdList from './IdList.svelte';
  import NameField from './NameField.svelte';

  interface Props {
    name: string;
    spec: Record<string, unknown>;
    me: string[];
    ids: Map<string, string>;
    onset: (field: string, value: unknown, created?: Created[]) => void;
    onme: (me: string[], created: Created[]) => void;
    onrename: (to: string) => string;
    ondelete: () => void;
  }
  let { name, spec, me, ids, onset, onme, onrename, ondelete }: Props = $props();

  const list = (v: unknown) => (Array.isArray(v) ? v.map(String) : []);
  const ME_HINT =
    'What you have without getting it through anything else, which everything is reached from: usually places, ' +
    'such as head (what you remember), body, carried, home, and contacts (people who’d lend you a device). ' +
    'A lockout takes some away; a breach starts from what the attacker has instead.';
</script>

<div class="form">
  <NameField
    label="Scenario"
    value={name}
    fixed={name === BASELINE
      ? 'The normal day is built in: you, with nothing lost. Every lockout is compared with it.'
      : undefined}
    {onrename}
  />
  {#if name === BASELINE}
    <IdList label="On a normal day you have" hint={ME_HINT} values={me} {ids} onchange={onme} />
  {:else}
    {@render fields()}
  {/if}
</div>

{#snippet fields()}
  <label class="field"
    >Kind
    <select value={spec.kind} onchange={(e) => onset('kind', e.currentTarget.value)}>
      {#each SCENARIO_KINDS as k (k)}<option value={k}>{k}</option>{/each}
    </select>
  </label>
  {#if spec.kind === 'breach'}
    <IdList
      label="Attacker has"
      hint="What the attacker starts with."
      values={list(spec.attacker)}
      {ids}
      onchange={(v: string[], created: Created[]) => onset('attacker', v, created)}
    />
  {/if}
  <IdList
    label="Lost"
    hint="What's gone in this scenario, and everything only in it."
    values={list(spec.lost)}
    {ids}
    onchange={(v: string[], created: Created[]) => onset('lost', v, created)}
  />
  <IdList
    label="Assume"
    hint="States that hold in this scenario."
    values={list(spec.assume)}
    {ids}
    states
    onchange={(v: string[], created: Created[]) => onset('assume', v, created)}
  />
  <IdList
    label="Deny"
    hint="States that don't."
    values={list(spec.deny)}
    {ids}
    states
    onchange={(v: string[], created: Created[]) => onset('deny', v, created)}
  />
  <label class="field"
    >Note
    <textarea
      rows="2"
      value={typeof spec.note === 'string' ? spec.note : ''}
      onchange={(e) => onset('note', e.currentTarget.value.trim())}></textarea>
  </label>
  <div>
    <button class="danger" onclick={ondelete}><Trash />Delete {name}</button>
  </div>
{/snippet}

<style>
  .form {
    display: grid;
    gap: var(--space-4);
  }
</style>
