<script lang="ts">
  // Adding from a template: pick one, then bind its slots to your things,
  // tick what you've set up, and see what it would change before adding it.
  import { ArrowLeft } from '@lucide/svelte';
  import type { ScenarioChange } from '../../engine/report.ts';
  import { show, validId } from './edit';
  import { instantiate, readTemplate, type Template } from './template';
  import Verdicts from './Verdicts.svelte';

  type Things = Record<string, Record<string, unknown>>;

  interface Props {
    /** The model's things, id to kind. */
    ids: Map<string, string>;
    /** Verdicts before and after adding these things; null if that can't be worked out. */
    preview: (things: Things) => ScenarioChange[] | null;
    onadd: (template: Template, prefix: string, things: Things, asPlan: boolean) => void;
    dialog?: HTMLDialogElement;
  }
  let { ids, preview, onadd, dialog = $bindable() }: Props = $props();

  const files = import.meta.glob<string>('../../templates/*.yml', { query: '?raw', import: 'default', eager: true });
  const templates = Object.entries(files)
    .map(([path, text]) => readTemplate(path.slice(path.lastIndexOf('/') + 1, -4), text))
    .sort((a, b) => a.name.localeCompare(b.name));

  const uid = $props.id();
  let query = $state('');
  let chosen = $state.raw<Template | null>(null);
  let prefix = $state('');
  let slots = $state<Record<string, string | null>>({});
  let include = $state<string[]>([]);

  const found = $derived(
    templates.filter((t) => `${t.name} ${t.note}`.toLowerCase().includes(query.trim().toLowerCase())),
  );

  function choose(t: Template) {
    chosen = t;
    prefix = t.prefix;
    // A thing of yours with the slot's id is most likely the one it means.
    slots = Object.fromEntries(t.slots.map((s) => [s.id, ids.has(s.id) ? s.id : null]));
    include = t.optional.filter((o) => o.on).map((o) => o.id);
  }

  function reset() {
    query = '';
    chosen = null;
  }

  // Only the slots something still needs, given what's ticked.
  const needed = $derived.by(() => {
    if (!chosen) return [];
    const left = instantiate(chosen, { prefix: chosen.prefix, slots: {}, include: new Set(include) });
    return chosen.slots.filter((s) => s.id in left);
  });
  const things = $derived(chosen ? instantiate(chosen, { prefix, slots, include: new Set(include) }) : {});
  const problem = $derived.by(() => {
    if (!validId(prefix)) return 'The prefix must be lowercase letters, digits and _, starting with a letter.';
    const taken = Object.keys(things).filter((id) => ids.has(id));
    if (taken.length) return `Already things: ${taken.join(', ')}. Pick yours for a slot, or change the prefix.`;
    return '';
  });
  const verdicts = $derived(chosen && !problem ? preview(things) : null);

  function add(asPlan: boolean) {
    if (!chosen || problem) return;
    dialog?.close();
    onadd(chosen, prefix, things, asPlan);
  }
</script>

<dialog bind:this={dialog} class="wide" aria-labelledby="{uid}-title" onclose={reset}>
  <div class="body">
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
      <p class="hint">
        Missing one you need? Templates live in the repository's templates/ folder, and new ones are welcome.
      </p>
      <div class="buttons">
        <button class="quiet" onclick={() => dialog?.close()}>Cancel</button>
      </div>
    {:else}
      <h2 id="{uid}-title">{chosen.name}</h2>
      <p>{chosen.note}</p>
      <p class="hint">Facts checked {chosen.checked}, against:</p>
      <ul class="links">
        {#each chosen.links as link (link.url)}<li>
            <a href={link.url} target="_blank" rel="noreferrer">{link.title}</a>
          </li>{/each}
      </ul>

      <div class="field">
        <label for="{uid}-prefix">Prefix</label>
        <input id="{uid}-prefix" bind:value={prefix} class="mono" aria-describedby="{uid}-prefix-hint" />
        <span class="hint" id="{uid}-prefix-hint">
          New ids start with it; another account of the same kind can take another, such as {chosen.prefix}_work.
        </span>
      </div>

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
            <label class="field"
              >{s.label}
              <select
                value={slots[s.id] ?? ''}
                onchange={(e) => (slots = { ...slots, [s.id]: e.currentTarget.value || null })}
              >
                <option value="">A new {s.kind}: {s.id}</option>
                {#each [...ids].filter(([, kind]) => kind === s.kind) as [id] (id)}<option value={id}>{id}</option
                  >{/each}
                <optgroup label="Other kinds">
                  {#each [...ids].filter(([, kind]) => kind !== s.kind) as [id, kind] (id)}<option value={id}
                      >{id} ({kind})</option
                    >{/each}
                </optgroup>
              </select>
            </label>
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
                <span class="muted">{spec.kind}</span>
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
        <button class="quiet" onclick={() => (chosen = null)}><ArrowLeft />Back</button>
        <span class="spacer"></span>
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
  .body {
    display: grid;
    gap: var(--space-4);
    padding: var(--space-5);
  }
  h2 {
    font-size: var(--text-lg);
  }
  h3 {
    font-size: var(--text-md);
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
  .pick {
    display: grid;
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
  .buttons {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
  .spacer {
    flex: 1;
  }
</style>
