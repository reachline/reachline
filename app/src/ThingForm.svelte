<script lang="ts">
  // Every field of a thing, as written in the layer being edited. Each change
  // is applied as it's made (fields of text once they lose focus).
  import { Trash } from '@lucide/svelte';
  import { KINDS, TAGS, type AndSet } from '../../engine/model.ts';
  import type { Created } from './edit';
  import IdInput from './IdInput.svelte';
  import IdList from './IdList.svelte';
  import NameField from './NameField.svelte';
  import WaysIn from './WaysIn.svelte';

  interface Props {
    id: string;
    spec: Record<string, unknown>;
    ids: Map<string, string>;
    onset: (field: string, value: unknown, created?: Created[]) => void;
    /** Renames it; gives a problem with the name, if there is one. */
    onrename: (to: string) => string;
    ondelete: () => void;
  }
  let { id, spec, ids, onset, onrename, ondelete }: Props = $props();

  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  const list = (v: unknown) => (Array.isArray(v) ? v.map(String) : []);
  const tags = $derived(list(spec.tags));
  const mirrors = $derived(spec.mirrors as { of?: string; by?: string } | null | undefined);
  // The source of a copy, kept here until what syncs it is given too.
  let copyOf = $state<{ of: string; created: Created[] } | null>(null);
  const TAG_HINTS = {
    critical: 'lockouts check you can still reach it',
    sensitive: 'breaches check an attacker can’t',
  };
</script>

<div class="form">
  <NameField label="Name" value={id} {onrename} />

  <label class="field"
    >Kind
    <select value={spec.kind} onchange={(e) => onset('kind', e.currentTarget.value)}>
      {#each KINDS as k (k)}<option value={k}>{k}</option>{/each}
    </select>
  </label>

  <fieldset>
    <legend>Tags</legend>
    {#each TAGS as t (t)}
      <label class="check"
        ><input
          type="checkbox"
          checked={tags.includes(t)}
          onchange={(e) =>
            onset(
              'tags',
              TAGS.filter((x) => (x === t ? e.currentTarget.checked : tags.includes(x))),
            )}
        />
        {t} <span class="hint">{TAG_HINTS[t]}</span></label
      >
    {/each}
  </fieldset>

  <label class="field"
    >Note
    <textarea rows="2" value={str(spec.note)} onchange={(e) => onset('note', e.currentTarget.value.trim())}></textarea>
  </label>
  <label class="field"
    >To do
    <textarea rows="2" value={str(spec.todo)} onchange={(e) => onset('todo', e.currentTarget.value.trim())}></textarea>
  </label>

  {#if spec.in === '?'}
    <fieldset>
      <legend>In</legend>
      <p>Unknown: it's reached only by assuming it.</p>
    </fieldset>
  {:else}
    <IdList
      label="In"
      hint="Where it lives. Reaching any one of these reaches it; it's lost once all of them are."
      values={list(spec.in)}
      {ids}
      onchange={(v: string[], created: Created[]) => onset('in', v, created)}
    />
  {/if}
  <label class="check"
    ><input
      type="checkbox"
      checked={spec.in === '?'}
      onchange={(e) => onset('in', e.currentTarget.checked ? '?' : [])}
    />
    Where it lives is unknown</label
  >

  <WaysIn
    label="Access"
    hint="Each way in needs all of its parts. Type a + b for all of them, a | b for any one, ? for an unknown."
    value={spec.access}
    {ids}
    onchange={(v: AndSet[], created: Created[]) => onset('access', v, created)}
  />
  <WaysIn
    label="Recovery"
    hint="Ways back in once access fails, such as recovery codes or a reset by email."
    value={spec.recovery}
    {ids}
    onchange={(v: AndSet[], created: Created[]) => onset('recovery', v, created)}
  />

  <IdList
    label="Needs"
    hint="What must still exist, reachable or not: the server it runs on, the DNS it depends on."
    values={list(spec.needs)}
    {ids}
    onchange={(v: string[], created: Created[]) => onset('needs', v, created)}
  />

  <fieldset>
    <legend>Mirrors</legend>
    {#if mirrors}
      <p>A copy of <span class="mono">{mirrors.of}</span>, synced by <span class="mono">{mirrors.by}</span>.</p>
      <div><button class="quiet" onclick={() => onset('mirrors', null)}>Not a copy</button></div>
    {:else}
      <p class="hint">A synced copy, lost once its source is lost while the sync still runs.</p>
      {#if copyOf}
        <p>A copy of <span class="mono">{copyOf.of}</span>, synced by:</p>
        <IdInput
          label={`What syncs ${id} from ${copyOf.of}`}
          placeholder="synced by…"
          {ids}
          onadd={([[by]]: string[][], created: Created[]) => {
            onset('mirrors', { of: copyOf!.of, by }, [...copyOf!.created, ...created]);
            copyOf = null;
          }}
        />
      {:else}
        <IdInput
          label="A synced copy of"
          placeholder="copy of…"
          {ids}
          onadd={([[of]]: string[][], created: Created[]) => (copyOf = { of, created })}
        />
      {/if}
    {/if}
  </fieldset>

  <div>
    <button class="danger" onclick={ondelete}><Trash />Delete {id}</button>
  </div>
</div>

<style>
  .form {
    display: grid;
    gap: var(--space-4);
  }
  .check {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--space-2);
  }
</style>
