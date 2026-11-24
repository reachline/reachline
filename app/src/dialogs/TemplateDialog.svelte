<script lang="ts">
  // Adding from a template: pick one, then bind its slots to your things,
  // tick what you've set up, and see what it would change before adding it.
  import { ArrowLeft } from '@lucide/svelte';
  import type { ScenarioChange } from '../../../engine/report.ts';
  import { idProblem, show } from '../lib/edit';
  import { instantiate, readTemplate, type Template } from './template';
  import Select from '../forms/Select.svelte';
  import type { SelectGroup } from '../forms/select';
  import Verdicts from '../panel/Verdicts.svelte';

  type Things = Record<string, Record<string, unknown>>;

  interface Props {
    /** The model's things, id to kind. */
    ids: Map<string, string>;
    /** Verdicts before and after adding these things; null if that can't be worked out. */
    preview: (things: Things) => ScenarioChange[] | null;
    /** `main` is the template's own thing (its id is the prefix), under the id it ends up with. */
    onadd: (template: Template, prefix: string, main: string | null, things: Things, asPlan: boolean) => void;
    dialog?: HTMLDialogElement;
  }
  let { ids, preview, onadd, dialog = $bindable() }: Props = $props();

  const files = import.meta.glob<string>('../../../templates/*.yml', { query: '?raw', import: 'default', eager: true });
  const templates = Object.entries(files)
    .map(([path, text]) => readTemplate(path.slice(path.lastIndexOf('/') + 1, -4), text))
    .sort((a, b) => a.name.localeCompare(b.name));

  const uid = $props.id();
  let query = $state('');
  let chosen = $state.raw<Template | null>(null);
  let prefix = $state('');
  let slots = $state<Record<string, string | null>>({});
  let include = $state<string[]>([]);
  let standsIn = $state<Record<string, string | null>>({});

  const found = $derived(
    templates.filter((t) => `${t.name} ${t.note}`.toLowerCase().includes(query.trim().toLowerCase())),
  );

  function choose(t: Template) {
    chosen = t;
    prefix = t.prefix;
    // A thing of yours with the slot's id is most likely the one it means.
    slots = Object.fromEntries(t.slots.map((s) => [s.id, ids.has(s.id) ? s.id : null]));
    include = t.optional.filter((o) => o.on).map((o) => o.id);
    // So is one that may stand in, as the starter's authenticator does.
    standsIn = Object.fromEntries(t.standsIn.flatMap((s) => (ids.has(s.id) ? [[s.id, s.id]] : [])));
  }

  const byName = (a: string, b: string) => a.localeCompare(b);
  /** Your things in a group for each kind, as the Thing picker has them: `kind` first, or alone. */
  function yours(kind: string, only = false): SelectGroup[] {
    const kinds = [...new Set(ids.values())].filter((k) => k !== kind).sort(byName);
    return [kind, ...(only ? [] : kinds)]
      .map((k) => ({
        name: k,
        kind: k,
        options: [...ids]
          .filter(([, t]) => t === k)
          .map(([id]) => id)
          .sort(byName)
          .map((id) => ({ value: id, kind: k, mono: true })),
      }))
      .filter((g) => g.options.length);
  }

  const slotGroups = (s: { id: string; kind: string }): SelectGroup[] => [
    { options: [{ value: '', label: `A new ${s.kind}: ${s.id}`, kind: s.kind }] },
    ...yours(s.kind),
  ];
  const standsGroups = (s: { kind: string }): SelectGroup[] => [
    { options: [{ value: '', label: `No, a new ${s.kind}`, kind: s.kind }] },
    ...yours(s.kind, true),
  ];

  function reset() {
    query = '';
    chosen = null;
  }

  // Only the slots something still needs, and what may stand in, given what's ticked.
  const left = $derived(
    chosen ? instantiate(chosen, { prefix: chosen.prefix, slots: {}, include: new Set(include) }) : {},
  );
  const needed = $derived(chosen?.slots.filter((s) => s.id in left) ?? []);
  const standing = $derived(chosen?.standsIn.filter((s) => s.id in left) ?? []);
  const things = $derived(chosen ? instantiate(chosen, { prefix, slots, include: new Set(include), standsIn }) : {});
  /** Yours that the template stands in for: they take its fields. */
  const replaced = $derived(new Set(standing.flatMap((s) => standsIn[s.id] ?? [])));
  const problem = $derived.by(() => {
    if (idProblem(prefix)) return idProblem(prefix);
    const taken = Object.keys(things).filter((id) => ids.has(id) && !replaced.has(id));
    if (taken.length) return `Already things: ${taken.join(', ')}. Pick yours for a slot, or change the prefix.`;
    return '';
  });
  const verdicts = $derived(chosen && !problem ? preview(things) : null);

  function add(asPlan: boolean) {
    if (!chosen || problem) return;
    dialog?.close();
    const main = standsIn[chosen.prefix] ?? prefix;
    onadd(chosen, prefix, main in things ? main : null, things, asPlan);
  }
</script>

<dialog bind:this={dialog} class="wide" aria-labelledby="{uid}-title" onclose={reset}>
  <div>
    {#if !chosen}
      <h2 id="{uid}-title">Add from a template</h2>
      <label class="field">Search <input type="search" bind:value={query} /></label>
      <ul class="list">
        {#each found as t (t.id)}
          <li>
            <button class="quiet pick" onclick={() => choose(t)}>
              <span class="name">{t.name}</span>
              <span class="muted">{t.note}</span>
            </button>
          </li>
        {:else}
          <li class="muted">No template matches.</li>
        {/each}
      </ul>
      <div class="buttons">
        <button class="quiet" onclick={() => dialog?.close()}>Cancel</button>
      </div>
    {:else}
      <header>
        <button class="quiet back" onclick={() => (chosen = null)}><ArrowLeft />All templates</button>
        <h2 id="{uid}-title">{chosen.name}</h2>
      </header>
      <p>{chosen.note}</p>
      <!-- A generic template (a bank, an authenticator) rests on no one service's docs. -->
      {#if chosen.links.length}
        <p class="hint">Facts checked {chosen.checked}, against:</p>
        <ul class="links">
          {#each chosen.links as link (link.url)}<li>
              <a href={link.url} target="_blank" rel="noreferrer">{link.title}</a>
            </li>{/each}
        </ul>
      {/if}

      <div class="field">
        <label for="{uid}-prefix">Prefix</label>
        <input id="{uid}-prefix" bind:value={prefix} class="mono" aria-describedby="{uid}-prefix-hint" />
        <span class="hint" id="{uid}-prefix-hint">
          New ids start with it; another account of the same kind can take another, such as {chosen.prefix}_work.
        </span>
      </div>

      {#each standing as s (s.id)}
        <div class="field">
          <span id="{uid}-stands-{s.id}">{s.label}</span>
          <Select
            aria-labelledby="{uid}-stands-{s.id}"
            value={standsIn[s.id] ?? ''}
            groups={standsGroups(s)}
            onchange={(v: string) => (standsIn = { ...standsIn, [s.id]: v || null })}
          />
        </div>
      {/each}

      {#if chosen.optional.length}
        <fieldset>
          <legend>What you've set up</legend>
          {#each chosen.optional as o (o.id)}
            <label class="check"><input type="checkbox" bind:group={include} value={o.id} /> {o.label}</label>
          {/each}
        </fieldset>
      {/if}

      {#if needed.length}
        <fieldset>
          <legend>Things you have</legend>
          {#each needed as s (s.id)}
            <div class="field">
              <span id="{uid}-slot-{s.id}">{s.label}</span>
              <Select
                aria-labelledby="{uid}-slot-{s.id}"
                value={slots[s.id] ?? ''}
                groups={slotGroups(s)}
                onchange={(v: string) => (slots = { ...slots, [s.id]: v || null })}
              />
            </div>
          {/each}
        </fieldset>
      {/if}

      {#if problem}
        <p class="error" role="alert">{problem}</p>
      {:else}
        <section class="preview" aria-labelledby="{uid}-adds">
          <h3 id="{uid}-adds">Adds</h3>
          <ul class="adds">
            {#each Object.entries(things) as [id, spec] (id)}
              <li>
                <span class="mono">{id}</span>
                <span class="muted">{replaced.has(id) ? `your ${String(spec.kind)}, updated` : spec.kind}</span>
                {#if spec.access}<span class="mono"> · {show('access', spec.access)}</span>{/if}
              </li>
            {/each}
          </ul>
          <h3>Verdicts</h3>
          {#if verdicts}<Verdicts changes={verdicts} />{:else}<p class="muted">
              Can't tell until the model loads.
            </p>{/if}
        </section>
      {/if}

      <div class="buttons">
        <button class="quiet" onclick={() => dialog?.close()}>Cancel</button>
        <button disabled={!!problem} onclick={() => add(true)}>Add as a plan</button>
        <button class="primary" disabled={!!problem} onclick={() => add(false)}>Add to model</button>
      </div>
    {/if}
  </div>
</dialog>

<style>
  .wide {
    width: min(40rem, calc(100% - 2 * var(--space-4)));
  }
  .list,
  .links,
  .adds {
    display: grid;
    gap: var(--space-1);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  /* Only the list scrolls, with room inside for the focus ring. */
  .list {
    max-height: min(28rem, 50vh);
    margin-inline: calc(-1 * var(--space-1));
    padding: var(--space-1);
    overflow-y: auto;
  }
  header {
    display: grid;
    justify-items: start;
    gap: var(--space-1);
  }
  /* Its icon lines up with the heading under it. */
  .back {
    margin-inline-start: calc(-1 * var(--space-3));
  }
  .pick {
    display: grid;
    /* Buttons centre what's in them; a row of a list starts at the edge. */
    justify-content: start;
    justify-items: start;
    width: 100%;
    padding: var(--space-2) var(--space-3);
    white-space: normal;
    text-align: start;
  }
  .name {
    font-weight: 600;
  }
  .check {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
  }
  .preview {
    display: grid;
    gap: var(--space-2);
    max-height: 40vh;
    overflow-y: auto;
  }
  .adds {
    font-size: var(--text-sm);
  }
</style>
