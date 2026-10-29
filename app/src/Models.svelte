<script lang="ts">
  import example from '../../examples/model.yml?raw';
  import type { ModelSummary } from '../../server/api.ts';
  import { api, message } from './api';
  import { EMPTY } from './data';
  import { follow, go } from './route.svelte.ts';

  let { user, onsignout }: { user: string; onsignout: () => void } = $props();

  let models = $state<ModelSummary[] | null>(null);
  let error = $state('');

  let newName = $state('');
  let start = $state<'empty' | 'example' | 'import'>('example');
  let imported = $state('');

  let renaming = $state<number | null>(null);
  let renameTo = $state('');

  let current = $state('');
  let next = $state('');
  let passwordNote = $state('');

  async function attempt(fn: () => Promise<unknown>) {
    error = '';
    try {
      await fn();
    } catch (e) {
      error = message(e);
    }
  }

  const refresh = () => attempt(async () => (models = await api.models()));
  void refresh();

  function create(e: SubmitEvent) {
    e.preventDefault();
    void attempt(async () => {
      const text = start === 'example' ? example : start === 'import' ? imported : EMPTY;
      const { id } = await api.create({ name: newName, text });
      go(`/m/${id}`);
    });
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

  function changePassword(e: SubmitEvent) {
    e.preventDefault();
    passwordNote = '';
    void attempt(async () => {
      await api.changePassword({ current, next });
      current = next = '';
      passwordNote = 'Password changed. Your other sessions are signed out.';
    });
  }

  function signOut() {
    void attempt(async () => {
      await api.logout();
      onsignout();
    });
  }
</script>

<main class="page">
  <header class="top">
    <h1>ReachLine</h1>
    <span class="muted">{user}</span>
    <button class="link" onclick={signOut}>Sign out</button>
  </header>

  {#if error}<p class="error">{error}</p>{/if}

  <section class="card">
    <h2>Your models</h2>
    {#if models === null}
      <p class="muted">Loading…</p>
    {:else if !models.length}
      <p class="muted">None yet. Create one below.</p>
    {:else}
      <ul class="models">
        {#each models as m (m.id)}
          <li>
            {#if renaming === m.id}
              <form class="inline" onsubmit={(e) => rename(e, m.id)}>
                <input bind:value={renameTo} required maxlength="100" aria-label="New name" />
                <button class="primary">Rename</button>
                <button type="button" onclick={() => (renaming = null)}>Cancel</button>
              </form>
            {:else}
              <a href="/m/{m.id}" onclick={follow}>{m.name}</a>
              <span class="muted">saved {new Date(m.updated).toLocaleString()}</span>
              <span class="row-actions">
                <button class="link" onclick={() => ((renaming = m.id), (renameTo = m.name))}>Rename</button>
                <button class="link danger" onclick={() => remove(m)}>Delete</button>
              </span>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  <form class="card" onsubmit={create}>
    <h2>New model</h2>
    <label>Name <input bind:value={newName} required maxlength="100" /></label>
    <fieldset>
      <legend>Start from</legend>
      <label class="choice"><input type="radio" bind:group={start} value="example" /> the example</label>
      <label class="choice"><input type="radio" bind:group={start} value="empty" /> nothing</label>
      <label class="choice"><input type="radio" bind:group={start} value="import" /> YAML you upload or paste</label>
    </fieldset>
    {#if start === 'import'}
      <label>File <input type="file" accept=".yml,.yaml,text/yaml,application/yaml,text/plain" onchange={pick} /></label
      >
      <label>YAML <textarea bind:value={imported} required rows="10" spellcheck="false"></textarea></label>
    {/if}
    <div class="actions"><button class="primary">Create</button></div>
  </form>

  <form class="card" onsubmit={changePassword}>
    <h2>Change password</h2>
    <input class="hidden" autocomplete="username" value={user} readonly aria-hidden="true" tabindex="-1" />
    <label>Current <input type="password" bind:value={current} autocomplete="current-password" required /></label>
    <label
      >New <input
        type="password"
        bind:value={next}
        autocomplete="new-password"
        minlength="8"
        maxlength="128"
        required
      /></label
    >
    {#if passwordNote}<p class="muted">{passwordNote}</p>{/if}
    <div class="actions"><button class="primary">Change password</button></div>
  </form>
</main>

<style>
  .top {
    display: flex;
    align-items: baseline;
    gap: 12px;
  }
  .top h1 {
    flex: 1;
  }
  .models {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .models li {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 4px 10px;
    padding: 8px 0;
    border-top: 1px solid var(--border);
  }
  .models li:first-child {
    border-top: none;
  }
  .models a {
    font-weight: 600;
  }
  .row-actions {
    margin-left: auto;
    display: flex;
    gap: 10px;
  }
  .inline {
    display: flex;
    flex: 1;
    gap: 6px;
  }
  .inline input {
    flex: 1;
  }
  fieldset {
    border: none;
    margin: 0;
    padding: 0;
  }
  legend {
    color: var(--muted);
    padding: 0;
    margin-bottom: 4px;
  }
  .choice {
    flex-direction: row;
    align-items: center;
    gap: 6px;
  }
  .hidden {
    display: none;
  }
  textarea {
    padding: 6px 8px;
    border: 1px solid var(--border);
    border-radius: 5px;
    background: var(--bg);
    color: var(--text);
    font: 12px var(--code-font);
    resize: vertical;
  }
</style>
