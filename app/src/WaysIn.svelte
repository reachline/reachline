<script lang="ts">
  // Access or recovery: ways in, each needing all of its parts, where a part
  // is an id, "?", or any one of several options.
  import { X } from '@lucide/svelte';
  import { fmtSet, leaves, type AndSet, type Expr } from '../../engine/model.ts';
  import { asElement } from './edit';
  import type { Created } from './edit';
  import IdInput from './IdInput.svelte';

  interface Props {
    label: string;
    hint: string;
    /** The field as written: a list of AND-sets, or "?". */
    value: unknown;
    ids: Map<string, string>;
    onchange: (sets: AndSet[], created: Created[]) => void;
  }
  let { label, hint, value, ids, onchange }: Props = $props();

  const uid = $props.id();
  const sets = $derived<AndSet[]>(
    value === '?' ? [['?']] : Array.isArray(value) ? value.filter((s): s is AndSet => Array.isArray(s)) : [],
  );
  const name = (o: Expr) => (Array.isArray(o) ? leaves(o).join(' + ') : o);
  const asOption = (o: string[]): Expr => (o.length === 1 ? o[0] : o);

  /** Sets with way i replaced; a way left with no parts goes, since it would need nothing. */
  function withWay(i: number, set: AndSet | null, created: Created[] = []) {
    const next = sets.flatMap((s, j) => (j !== i ? [s] : set?.length ? [set] : []));
    onchange(next, created);
  }

  function removeOption(i: number, j: number, k: number) {
    const options = (sets[i][j] as Expr[]).filter((_, x) => x !== k);
    const part = options.length === 1 && !Array.isArray(options[0]) ? options[0] : options;
    withWay(
      i,
      sets[i].flatMap((p, x) => (x !== j ? [p] : options.length ? [part] : [])),
    );
  }
</script>

<fieldset aria-describedby="{uid}-hint">
  <legend>{label}</legend>
  <p class="hint" id="{uid}-hint">{hint}</p>
  {#each sets as set, i (i)}
    <div class="way">
      <div class="head">
        <span class="mono">{fmtSet(set) || 'nothing'}</span>
        <button
          class="quiet icon"
          aria-label={`Remove ${label.toLowerCase()} way ${i + 1}`}
          title="Remove this way in"
          onclick={() => withWay(i, null)}><X /></button
        >
      </div>
      <ul class="parts">
        {#each set as part, j (j)}
          <li>
            {#if Array.isArray(part)}
              <span class="muted">any one of</span>
              <ul class="chips">
                {#each part as option, k (k)}
                  <li class="chip">
                    {name(option)}<button
                      class="quiet icon"
                      aria-label={`Remove ${name(option)} as an option`}
                      title="Remove"
                      onclick={() => removeOption(i, j, k)}><X /></button
                    >
                  </li>
                {/each}
              </ul>
              <IdInput
                label={`Another option beside ${part.map(name).join(', ')}`}
                placeholder="or…"
                {ids}
                parts
                onadd={(options: string[][], created: Created[]) =>
                  withWay(
                    i,
                    set.map((p, x) => (x === j ? [...(p as Expr[]), ...options.map(asOption)] : p)),
                    created,
                  )}
              />
            {:else}
              <span class="chip"
                >{part}<button
                  class="quiet icon"
                  aria-label={`Remove ${part} from way ${i + 1}`}
                  title="Remove"
                  onclick={() =>
                    withWay(
                      i,
                      set.filter((_, x) => x !== j),
                    )}><X /></button
                ></span
              >
            {/if}
          </li>
        {/each}
      </ul>
      <IdInput
        label={`Also needed for way ${i + 1}`}
        placeholder="and…"
        {ids}
        parts
        onadd={(options: string[][], created: Created[]) => withWay(i, [...set, ...asElement(options)], created)}
      />
    </div>
  {/each}
  <IdInput
    label={`A new ${label.toLowerCase()} way`}
    placeholder="a + b, or a | b"
    {ids}
    parts
    onadd={(options: string[][], created: Created[]) => onchange([...sets, asElement(options)], created)}
  />
</fieldset>

<style>
  .way {
    display: grid;
    gap: var(--space-2);
    padding: var(--space-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }
  .head {
    display: flex;
    align-items: start;
    justify-content: space-between;
    gap: var(--space-2);
  }
  .head .mono {
    padding-top: var(--space-1);
  }
  .parts {
    display: grid;
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .parts > li {
    display: grid;
    gap: var(--space-1);
    justify-items: start;
  }
</style>
