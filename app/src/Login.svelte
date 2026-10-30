<script lang="ts">
  import type { AuthOptions } from '../../server/api.ts';
  import { api, message, takeSsoProblem } from './api';
  import Brand from './Brand.svelte';
  import { afterLogin } from './route.svelte.ts';
  import ThemeSwitch from './ThemeSwitch.svelte';

  let { onsignin }: { onsignin: (username: string) => void } = $props();

  let username = $state('');
  let password = $state('');
  let options = $state<AuthOptions>();
  let creating = $state(false);
  let error = $state(takeSsoProblem());
  let busy = $state(false);

  void api.options().then(
    (o) => (options = o),
    (e: unknown) => (error = message(e)),
  );

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

  // A navigation, not a form: CSP's form-action would block the provider's redirect.
  function withProvider() {
    location.assign(`/api/auth/oidc?next=${encodeURIComponent(afterLogin())}`);
  }

  function switchMode() {
    creating = !creating;
    error = '';
  }
</script>

<div class="screen">
  <main class="auth">
    <Brand />
    <div class="card">
      <h1>{creating ? 'Create an account' : 'Sign in'}</h1>
      {#if options?.password}
        <form onsubmit={submit}>
          <label class="field"
            >Username
            <input bind:value={username} autocomplete="username" autocapitalize="none" spellcheck="false" required />
          </label>
          <div class="field">
            <label for="password">Password</label>
            <input
              id="password"
              type="password"
              bind:value={password}
              autocomplete={creating ? 'new-password' : 'current-password'}
              minlength={creating ? 8 : undefined}
              maxlength="128"
              aria-describedby={creating ? 'password-hint' : undefined}
              required
            />
            {#if creating}<span class="hint" id="password-hint">At least 8 characters.</span>{/if}
          </div>
          <button class="primary" disabled={busy}>
            {#if creating}{busy ? 'Creating account…' : 'Create account'}{:else}{busy ? 'Signing in…' : 'Sign in'}{/if}
          </button>
        </form>
      {/if}
      {#if options?.oidc && !creating}
        {#if options.password}<p class="or muted">or</p>{/if}
        <button class={{ primary: !options.password }} disabled={busy} onclick={withProvider}>{options.oidc}</button>
      {/if}
      {#if error}<p class="error" role="alert">{error}</p>{/if}
    </div>
    {#if options?.password && (options.registration || creating)}
      <p class="switch">
        {creating ? 'Have an account?' : 'New here?'}
        <button onclick={switchMode}>{creating ? 'Sign in' : 'Create an account'}</button>
      </p>
    {/if}
  </main>
  <footer><ThemeSwitch /></footer>
</div>

<style>
  .screen {
    display: grid;
    grid-template-rows: 1fr auto;
    min-height: 100%;
    padding: var(--space-4);
  }
  .auth {
    display: grid;
    align-content: start;
    gap: var(--space-5);
    width: 100%;
    max-width: 22rem;
    margin: 0 auto;
    padding-top: 12vh;
  }
  .card,
  form {
    display: grid;
    gap: var(--space-4);
  }
  .card {
    padding: var(--space-5);
  }
  .or {
    text-align: center;
  }
  .switch {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    color: var(--muted);
  }
  footer {
    display: flex;
    justify-content: center;
    padding-top: var(--space-5);
  }
</style>
