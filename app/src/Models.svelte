<script lang="ts">
  import { Pencil, Plus, Trash } from '@lucide/svelte';
  import example from '../../examples/model.yml?raw';
  import type { ModelSummary } from '../../server/api.ts';
  import { api, message } from './api';
  import { EMPTY } from './data';
  import { follow, go } from './route.svelte.ts';
  import TopBar from './TopBar.svelte';

  let { user, onsignout }: { user: string; onsignout: () => void } = $props();

  let models = $state<ModelSummary[] | null>(null);
  let error = $state('');

  let creating = $state<HTMLDialogElement>();
  let newName = $state('');
  let start = $state<'empty' | 'example' | 'import'>('example');
  let imported = $state('');
  let createError = $state('');

  let renaming = $state<number | null>(null);
  let renameTo = $state('');

  /** Runs fn, putting what goes wrong in the setter's place. */
  async function attempt(fn: () => Promise<unknown>, fail = (m: string) => (error = m)) {
    fail('');
    try {
      await fn();
    } catch (e) {
      fail(message(e));
    }
  }

  const refresh = () => attempt(async () => (models = await api.models()));
  void refresh();

  function create(e: SubmitEvent) {
    e.preventDefault();
    void attempt(
      async () => {
        const text = start === 'example' ? example : start === 'import' ? imported : EMPTY;
        const { id } = await api.create({ name: newName, text });
        go(`/m/${id}`);
      },
      (m) => (createError = m),
    );
  }

  /** A file's text goes into the box, where it can still be changed; its name is the default. */
  async function pick(e: Event) {
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    imported = await file.text();
    newName ||= file.name.replace(/\.[^.]*$/, '');
  }

  function rename(e: SubmitEvent, id: number) {
    e.preventDefault();
    void attempt(async () => {
      await api.rename(id, renameTo);
      renaming = null;
      await refresh();
    });
  }

  function remove(m: ModelSummary) {
    if (!confirm(`Delete ${m.name} and all of its history? This can't be undone.`)) return;
    void attempt(async () => {
      await api.remove(m.id);
      await refresh();
    });
  }

  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  const UNITS = [
    ['year', 365 * 86400],
    ['month', 30 * 86400],
    ['week', 7 * 86400],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ] as const;

  /** "3 hours ago" and the like. */
  function ago(iso: string) {
    const s = (Date.parse(iso) - Date.now()) / 1000;
    for (const [unit, n] of UNITS) if (Math.abs(s) >= n) return rtf.format(Math.round(s / n), unit);
    return 'just now';
  }

  const focus = (el: HTMLElement) => el.focus();
</script>

<TopBar {user} {onsignout} />

<main class="page">
  <div class="title">
    <h1>Your models</h1>
    <button class="primary" onclick={() => creating?.showModal()}><Plus />New model</button>
  </div>

  {#if error}<p class="error" role="alert">{error}</p>{/if}

  {#if models === null}
    <p class="muted">Loading…</p>
  {:else if !models.length}
    <p class="card empty muted">No models yet. Start one from the example, from nothing, or from YAML you have.</p>
  {:else}
    <ul class="card models">
      {#each models as m (m.id)}
        <li>
          {#if renaming === m.id}
            <form class="rename" onsubmit={(e) => rename(e, m.id)}>
              <input
                bind:value={renameTo}
                required
                maxlength="100"
                aria-label="New name for {m.name}"
                onkeydown={(e) => e.key === 'Escape' && (renaming = null)}
                {@attach focus}
              />
              <button class="primary">Rename</button>
              <button type="button" class="quiet" onclick={() => (renaming = null)}>Cancel</button>
            </form>
          {:else}
            <div class="name">
              <a href="/m/{m.id}" onclick={follow}>{m.name}</a>
              <time class="muted" datetime={m.updated} title={new Date(m.updated).toLocaleString()}>
                Saved {ago(m.updated)}
              </time>
            </div>
            <span class="actions">
              <button
                class="quiet"
                aria-label="Rename {m.name}"
                onclick={() => ((renaming = m.id), (renameTo = m.name))}><Pencil />Rename</button
              >
              <button class="quiet danger" aria-label="Delete {m.name}" onclick={() => remove(m)}
                ><Trash />Delete</button
              >
            </span>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</main>

<dialog bind:this={creating} aria-labelledby="new-model">
  <form class="new" onsubmit={create}>
    <h2 id="new-model">New model</h2>
    <label class="field">Name <input bind:value={newName} required maxlength="100" /></label>
    <fieldset>
      <legend>Start from</legend>
      <label class="choice"><input type="radio" bind:group={start} value="example" /> The example</label>
      <label class="choice"><input type="radio" bind:group={start} value="empty" /> Nothing</label>
      <label class="choice"><input type="radio" bind:group={start} value="import" /> YAML you upload or paste</label>
    </fieldset>
    {#if start === 'import'}
      <label class="field"
        >File
        <input type="file" accept=".yml,.yaml,text/yaml,application/yaml,text/plain" onchange={pick} />
      </label>
      <label class="field"
        >YAML <textarea class="mono" bind:value={imported} required rows="8" spellcheck="false"></textarea>
      </label>
    {/if}
    {#if createError}<p class="error" role="alert">{createError}</p>{/if}
    <div class="buttons">
      <button type="button" class="quiet" onclick={() => creating?.close()}>Cancel</button>
      <button class="primary">Create</button>
    </div>
  </form>
</dialog>

<style>
  .page {
    display: grid;
    gap: var(--space-5);
    max-width: 48rem;
    margin: 0 auto;
    padding: var(--space-6) var(--space-4);
  }
  .title {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
  }
  .empty {
    padding: var(--space-5);
    text-align: center;
  }
  .models {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .models li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2) var(--space-4);
    padding: var(--space-3) var(--space-4);
  }
  .models li + li {
    border-top: 1px solid var(--border);
  }
  .name {
    display: grid;
    flex: 1;
    min-width: 12rem;
  }
  .name a {
    font-weight: 600;
    overflow-wrap: anywhere;
  }
  time {
    font-size: var(--text-sm);
  }
  .actions {
    display: flex;
    gap: var(--space-1);
  }
  .rename {
    display: flex;
    flex: 1;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
  .rename input {
    flex: 1 1 8rem;
    min-width: 0;
  }
  .new {
    display: grid;
    gap: var(--space-4);
    padding: var(--space-5);
  }
  textarea {
    resize: vertical;
  }
  .buttons {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
  }
</style>
