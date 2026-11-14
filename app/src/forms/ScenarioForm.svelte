<script lang="ts">
  // A scenario's fields, as written in the layer being edited. The normal day
  // is built in, so it has none: there it's what you have (`me`), which every
  // lockout starts from.
  import { Trash } from '@lucide/svelte';
  import { BASELINE, SCENARIO_KINDS } from '../../../engine/model.ts';
  import { asList as list, type Created } from '../lib/edit';
  import IdList from './IdList.svelte';
  import KindSelect from './KindSelect.svelte';
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

  const uid = $props.id();

  const ME_HINT =
    'What you have without getting it through anything else, which everything is reached from: usually places, ' +
    'such as head (what you remember), body, carried, home, and contacts (people who’d lend you a device). ' +
    'A lockout starts from these unless it says otherwise; a breach starts from what the attacker has instead.';
</script>

<div class="form">
  <NameField
    label="Scenario"
    value={name}
    fixed={name === BASELINE
      ? 'The normal day is built in: you, with nothing gone. Every lockout is compared with it.'
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
  <div class="field">
    <span id="{uid}-kind">Kind</span>
    <KindSelect
      aria-labelledby="{uid}-kind"
      value={typeof spec.kind === 'string' ? spec.kind : ''}
      options={SCENARIO_KINDS}
      onchange={(k: string) => onset('kind', k)}
    />
  </div>
  <IdList
    label={spec.kind === 'breach' ? 'Attacker has' : 'Has'}
    hint={spec.kind === 'breach'
      ? 'What the attacker starts with.'
      : 'Leave it empty to start from what you have on a normal day. Name what someone else has, such as a partner, to see what they could reach without you.'}
    values={list(spec.has)}
    {ids}
    onchange={(v: string[], created: Created[]) => onset('has', v, created)}
  />
  <IdList
    label="Gone"
    hint="What no longer exists in this scenario, for anyone, and everything that existed only through it."
    values={list(spec.gone)}
    {ids}
    onchange={(v: string[], created: Created[]) => onset('gone', v, created)}
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
