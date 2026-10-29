<script lang="ts">
  import { ArrowLeft } from '@lucide/svelte';
  import { api, message } from './api';
  import { follow } from './route.svelte.ts';
  import TopBar from './TopBar.svelte';

  let { user, onsignout }: { user: string; onsignout: () => void } = $props();

  let current = $state('');
  let next = $state('');
  let note = $state('');
  let error = $state('');
  let busy = $state(false);

  async function changePassword(e: SubmitEvent) {
    e.preventDefault();
    busy = true;
    note = error = '';
    try {
      await api.changePassword({ current, next });
      current = next = '';
      note = 'Password changed. Your other sessions are signed out.';
    } catch (e) {
      error = message(e);
    } finally {
      busy = false;
    }
  }
</script>

<TopBar {user} {onsignout} />

<main class="page">
  <a class="back" href="/" onclick={follow}><ArrowLeft />Your models</a>
  <div class="title">
    <h1>Account</h1>
    <p class="muted">Signed in as {user}</p>
  </div>

  <form class="card password" onsubmit={changePassword}>
    <h2>Change password</h2>
    <p class="muted">Changing it signs you out everywhere else.</p>
    <input class="hidden" autocomplete="username" value={user} readonly aria-hidden="true" tabindex="-1" />
    <div class="fields">
      <label class="field"
        >Current password
        <input type="password" bind:value={current} autocomplete="current-password" required />
      </label>
      <div class="field">
        <label for="new-password">New password</label>
        <input
          id="new-password"
          type="password"
          bind:value={next}
          autocomplete="new-password"
          minlength="8"
          maxlength="128"
          aria-describedby="new-password-hint"
          required
        />
        <span class="hint" id="new-password-hint">At least 8 characters.</span>
      </div>
    </div>
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    {#if note}<p class="muted" role="status">{note}</p>{/if}
    <div><button disabled={busy}>{busy ? 'Changing password…' : 'Change password'}</button></div>
  </form>
</main>

<style>
  .page {
    display: grid;
    gap: var(--space-5);
    max-width: 48rem;
    margin: 0 auto;
    padding: var(--space-5) var(--space-4) var(--space-6);
  }
  .back {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    justify-self: start;
  }
  .title {
    display: grid;
    gap: var(--space-1);
  }
  .password {
    display: grid;
    gap: var(--space-4);
    padding: var(--space-5);
  }
  .password h2 + p {
    margin-top: calc(-1 * var(--space-3));
  }
  .fields {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
    align-items: start;
    gap: var(--space-4);
  }
  .hidden {
    display: none;
  }
</style>
