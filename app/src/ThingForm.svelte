<script lang="ts">
  // Every field of a thing, as written in the layer being edited. Each change
  // is applied as it's made (fields of text once they lose focus).
  import { Trash } from '@lucide/svelte';
  import { CHECKS, KINDS } from '../../engine/model.ts';
  import CondField from './CondField.svelte';
  import type { Created } from './edit';
  import IdInput from './IdInput.svelte';
  import IdList from './IdList.svelte';
  import NameField from './NameField.svelte';
  import Tip from './Tip.svelte';

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

  const uid = $props.id();

  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  const list = (v: unknown) => (Array.isArray(v) ? v.map(String) : []);
  const checks = $derived(list(spec.check));
  const mirrors = $derived(spec.mirrors as { of?: string; by?: string } | null | undefined);
  // The source of a copy, kept here until what syncs it is given too.
  let copyOf = $state<{ of: string; created: Created[] } | null>(null);
  const CHECK_HINT =
    'Check what you care about for its own sake (your mail, your documents, your money), not the passwords, keys, ' +
    'devices and servers that lead to it. ReachLine follows those, so a stolen key shows up as the accounts it opens.';
  const CHECK_HINTS = {
    lockout: 'Lockouts report it if you can’t reach it any more.',
    breach: 'Breaches report it if an attacker can reach it.',
  };
  const IN_HINT =
    'Reaching any one of these reaches it; it’s lost only once all of them are. ' +
    'unknown is a place you don’t know: never lost, and reached only by assuming it.';
  const GRAMMAR = 'Join ids with and or or, and bracket a group, as in pw and (totp or key).';
  const MIRRORS_HINT = 'A synced copy, lost once its source is lost while the sync still runs.';
</script>

<div class="form">
  <NameField label="Name" value={id} {onrename} />

  <label class="field"
    >Kind
    <select value={spec.kind} onchange={(e) => onset('kind', e.currentTarget.value)}>
      {#each KINDS as k (k)}<option value={k}>{k}</option>{/each}
    </select>
  </label>

  <fieldset aria-labelledby="{uid}-check" aria-describedby="{uid}-check-hint">
    <legend
      ><span id="{uid}-check">Check for</span><Tip id="{uid}-check-hint" about="Check for" text={CHECK_HINT} /></legend
    >
    {#each CHECKS as c (c)}
      <div class="check">
        <label
          ><input
            type="checkbox"
            checked={checks.includes(c)}
            aria-describedby="{uid}-{c}"
            onchange={(e) =>
              onset(
                'check',
                CHECKS.filter((x) => (x === c ? e.currentTarget.checked : checks.includes(x))),
              )}
          />
          {c}</label
        ><Tip id="{uid}-{c}" about={c} text={CHECK_HINTS[c]} />
      </div>
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

  <IdList
    label="Lives in"
    hint={IN_HINT}
    values={list(spec.in)}
    {ids}
    unknown
    onchange={(v: string[], created: Created[]) => onset('in', v, created)}
  />
  <CondField
    label="Accessed with"
    hint={`It’s reached when this holds. unknown stands for what you don’t know, such as what support asks for. ${GRAMMAR}`}
    value={spec.access}
    {ids}
    unknown
    onchange={(v: string | null, created: Created[]) => onset('access', v, created)}
  />
  <CondField
    label="Recovered with"
    hint={`A way back in once access fails, such as recovery codes or a reset by email. ${GRAMMAR}`}
    value={spec.recovery}
    {ids}
    unknown
    onchange={(v: string | null, created: Created[]) => onset('recovery', v, created)}
  />
  <CondField
    label="Needs"
    hint={`It exists only while this holds, reachable or not: the server it runs on, the domain it depends on. ${GRAMMAR}`}
    value={spec.needs}
    {ids}
    onchange={(v: string | null, created: Created[]) => onset('needs', v, created)}
  />

  <fieldset aria-labelledby="{uid}-mirrors" aria-describedby="{uid}-mirrors-hint">
    <legend
      ><span id="{uid}-mirrors">Mirrors</span><Tip
        id="{uid}-mirrors-hint"
        about="Mirrors"
        text={MIRRORS_HINT}
      /></legend
    >
    {#if mirrors}
      <p>A copy of <span class="mono">{mirrors.of}</span>, synced by <span class="mono">{mirrors.by}</span>.</p>
      <div><button class="quiet" onclick={() => onset('mirrors', null)}>Not a copy</button></div>
    {:else}
      {#if copyOf}
        <p>A copy of <span class="mono">{copyOf.of}</span>, synced by:</p>
        <IdInput
          label={`What syncs ${id} from ${copyOf.of}`}
          placeholder="synced by…"
          {ids}
          onadd={(by: string, created: Created[]) => {
            onset('mirrors', { of: copyOf!.of, by }, [...copyOf!.created, ...created]);
            copyOf = null;
          }}
        />
      {:else}
        <IdInput
          label="A synced copy of"
          placeholder="copy of…"
          {ids}
          onadd={(of: string, created: Created[]) => (copyOf = { of, created })}
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
  .check,
  .check label {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }
</style>
