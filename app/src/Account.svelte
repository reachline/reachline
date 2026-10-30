<script lang="ts">
  import { ArrowLeft } from '@lucide/svelte';
  import type { AuthOptions, Me } from '../../server/api.ts';
  import { api, message, needsReauth, takeSsoProblem } from './api';
  import { follow, go } from './route.svelte.ts';
  import TopBar from './TopBar.svelte';

  let { user, onsignout }: { user: string; onsignout: () => void } = $props();

  type Section = 'password' | 'sso' | 'delete';

  let me = $state<Me>();
  let options = $state<AuthOptions>();
  let loadError = $state('');
  let busy = $state(false);

  let current = $state('');
  let next = $state('');
  let again = $state('');

  // What the last action came to, shown in its own section.
  let outcome = $state<{ section: Section; text: string; failed: boolean; reauth?: boolean }>();
  const ssoProblem = takeSsoProblem();
  if (ssoProblem) outcome = { section: 'sso', text: ssoProblem, failed: true };

  let dialog = $state<HTMLDialogElement>();
  let asking = $state<{ section: Section; title: string; text: string; confirm: string; run: () => Promise<void> }>();

  async function load() {
    [me, options] = await Promise.all([api.me(), api.options()]);
  }
  load().catch((e: unknown) => (loadError = message(e)));

  async function act(section: Section, run: () => Promise<void>, done = '') {
    busy = true;
    outcome = undefined;
    try {
      await run();
      if (done) outcome = { section, text: done, failed: false };
    } catch (e) {
      outcome = { section, text: message(e), failed: true, reauth: needsReauth(e) };
    } finally {
      busy = false;
    }
  }

  function savePassword(e: SubmitEvent) {
    e.preventDefault();
    if (next !== again) {
      outcome = { section: 'password', text: "The new passwords don't match.", failed: true };
      return;
    }
    const adding = !me!.password;
    void act(
      'password',
      async () => {
        await api.setPassword(adding ? { next } : { current, next });
        current = next = again = '';
        await load();
      },
      adding ? 'Password added.' : 'Password changed. Your other sessions are signed out.',
    );
  }

  const link = () =>
    act('sso', async () => {
      location.assign((await api.link()).url);
    });

  function ask(question: NonNullable<typeof asking>) {
    asking = question;
    dialog?.showModal();
  }

  function confirmed() {
    const { section, run } = asking!;
    dialog?.close();
    void act(section, run);
  }

  async function signInAgain() {
    try {
      await api.logout();
      onsignout();
    } catch (e) {
      outcome = { section: outcome?.section ?? 'password', text: message(e), failed: true };
    }
  }
</script>

{#snippet feedback(section: Section)}
  {#if outcome?.section === section}
    {#if outcome.failed}
      <div class="problem">
        <p class="error" role="alert">{outcome.text}</p>
        {#if outcome.reauth}<button onclick={signInAgain}>Sign in again</button>{/if}
      </div>
    {:else}
      <p class="muted" role="status">{outcome.text}</p>
    {/if}
  {/if}
{/snippet}

<TopBar {user} {onsignout} />

<main class="page">
  <a class="back" href="/" onclick={follow}><ArrowLeft />Your models</a>
  <div class="title">
    <h1>Account</h1>
    <p class="muted">Signed in as {user}</p>
  </div>

  {#if loadError}
    <p class="error" role="alert">{loadError}</p>
  {:else if me && options}
    {#if options.password}
      <form class="card section" onsubmit={savePassword}>
        <h2>{me.password ? 'Change password' : 'Add a password'}</h2>
        <p class="muted">
          {me.password
            ? 'Changing it signs you out everywhere else.'
            : `To sign in as ${me.username} with a password as well.`}
        </p>
        <input class="hidden" autocomplete="username" value={user} readonly aria-hidden="true" tabindex="-1" />
        <div class="fields">
          {#if me.password}
            <label class="field"
              >Current password
              <input type="password" bind:value={current} autocomplete="current-password" required />
            </label>
          {/if}
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
          <label class="field"
            >Confirm new password
            <input type="password" bind:value={again} autocomplete="new-password" maxlength="128" required />
          </label>
        </div>
        {@render feedback('password')}
        <div class="buttons">
          <button disabled={busy}>{me.password ? 'Change password' : 'Add password'}</button>
          {#if me.password && me.linked && options.oidc}
            <button
              type="button"
              class="danger"
              disabled={busy}
              onclick={() =>
                ask({
                  section: 'password',
                  title: 'Remove your password?',
                  text: `You'll be able to sign in only with your identity provider, as ${me!.linked}.`,
                  confirm: 'Remove password',
                  run: async () => {
                    await api.removePassword();
                    await load();
                  },
                })}>Remove password</button
            >
          {/if}
        </div>
      </form>
    {/if}

    {#if options.oidc}
      <section class="card section">
        <h2>Single sign-on</h2>
        {#if me.linked}
          <p>Linked to your identity provider as <strong>{me.linked}</strong>.</p>
        {:else}
          <p class="muted">Link an account at your identity provider to sign in with it.</p>
        {/if}
        {@render feedback('sso')}
        {#if !me.linked}
          <div><button disabled={busy} onclick={link}>Link account</button></div>
        {:else if options.password && me.password}
          <div>
            <button
              class="danger"
              disabled={busy}
              onclick={() =>
                ask({
                  section: 'sso',
                  title: 'Unlink your identity provider?',
                  text: "You'll be able to sign in only with your password.",
                  confirm: 'Unlink',
                  run: async () => {
                    await api.unlink();
                    await load();
                  },
                })}>Unlink</button
            >
          </div>
        {/if}
      </section>
    {/if}

    <section class="card section">
      <h2>Delete account</h2>
      <p class="muted">Deletes your account and all of your models, with their history.</p>
      {@render feedback('delete')}
      <div>
        <button
          class="danger"
          disabled={busy}
          onclick={() =>
            ask({
              section: 'delete',
              title: 'Delete your account?',
              text: `This deletes ${user} and all of your models from this server, with their history. It can't be undone.`,
              confirm: 'Delete account',
              run: async () => {
                await api.deleteAccount();
                go('/', true);
                onsignout();
              },
            })}>Delete account</button
        >
      </div>
    </section>
  {/if}
</main>

<dialog bind:this={dialog} aria-labelledby="confirm-title" aria-describedby="confirm-text">
  {#if asking}
    <div class="confirm">
      <h2 id="confirm-title">{asking.title}</h2>
      <p id="confirm-text">{asking.text}</p>
      <div class="buttons end">
        <button class="quiet" onclick={() => dialog?.close()}>Cancel</button>
        <button class="danger" onclick={confirmed}>{asking.confirm}</button>
      </div>
    </div>
  {/if}
</dialog>

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
  .section,
  .confirm {
    display: grid;
    gap: var(--space-4);
    padding: var(--space-5);
  }
  .section h2 + p {
    margin-top: calc(-1 * var(--space-3));
  }
  .fields {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
    align-items: start;
    gap: var(--space-4);
  }
  .buttons,
  .problem {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2) var(--space-3);
  }
  .end {
    justify-content: flex-end;
  }
  .hidden {
    display: none;
  }
</style>
