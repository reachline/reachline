<script lang="ts">
  import { api, message } from './api';

  let { onsignin }: { onsignin: (username: string) => void } = $props();

  let username = $state('');
  let password = $state('');
  let registration = $state(false);
  let creating = $state(false);
  let error = $state('');
  let busy = $state(false);

  void api.options().then((o) => {
    registration = o.registration;
  }, message);

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    busy = true;
    error = '';
    try {
      const me = await (creating ? api.register : api.login)({ username, password });
      onsignin(me.username);
    } catch (e) {
      error = message(e);
    } finally {
      busy = false;
    }
  }
</script>

<main class="page narrow">
  <h1>ReachLine</h1>
  <form class="card" onsubmit={submit}>
    <h2>{creating ? 'Create an account' : 'Sign in'}</h2>
    <label>Username <input bind:value={username} autocomplete="username" autocapitalize="none" required /></label>
    <label
      >Password
      <input
        type="password"
        bind:value={password}
        autocomplete={creating ? 'new-password' : 'current-password'}
        minlength={creating ? 8 : undefined}
        required
      />
    </label>
    {#if error}<p class="error">{error}</p>{/if}
    <div class="actions">
      <button class="primary" disabled={busy}>{creating ? 'Create account' : 'Sign in'}</button>
      {#if registration || creating}
        <button type="button" class="link" onclick={() => ((creating = !creating), (error = ''))}>
          {creating ? 'I have an account' : 'Create an account'}
        </button>
      {/if}
    </div>
  </form>
</main>
