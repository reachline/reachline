<script lang="ts">
  import { ArrowLeft } from '@lucide/svelte';
  import type { AuthOptions, CreatedToken, Me, TokenSummary } from '../../../server/api.ts';
  import { api, message, needsReauth, takeSsoProblem } from '../lib/api';
  import { follow, go } from '../lib/route.svelte.ts';
  import Confirm from '../dialogs/Confirm.svelte';
  import type { Question } from '../dialogs/confirm';
  import TopBar from '../shell/TopBar.svelte';

  let { user, onsignout }: { user: string; onsignout: () => void } = $props();

  type Section = 'password' | 'sso' | 'cli' | 'delete';

  let me = $state<Me>();
  let options = $state<AuthOptions>();
  let tokens = $state<TokenSummary[]>([]);
  let loadError = $state('');
  let busy = $state(false);

  let current = $state('');
  let next = $state('');
  let again = $state('');

  // What the last action came to, shown in its own section.
  let outcome = $state<{ section: Section; text: string; failed: boolean; reauth?: boolean }>();
  const ssoProblem = takeSsoProblem();
  if (ssoProblem) outcome = { section: 'sso', text: ssoProblem, failed: true };

  let asking = $state<Question & { section: Section; run: () => Promise<void> }>();

  // `reachline login` links here with ?new-token=NAME, the computer's name; taken out of the URL.
  function takeTokenName(): string {
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- read once, never kept as state
    const params = new URLSearchParams(location.search);
    const name = params.get('new-token');
    if (name === null) return '';
    params.delete('new-token');
    go(location.pathname + (params.size ? `?${params}` : ''), true);
    return name;
  }
  let tokenName = $state(takeTokenName());
  // Its secret is shown once, until the page is left.
  let created = $state<CreatedToken>();
  const setup = [
    `mkdir -p ~/.local/bin && curl -fsSL ${location.origin}/reachline.mjs -o ~/.local/bin/reachline`,
    'chmod +x ~/.local/bin/reachline',
    `reachline login ${location.origin}`,
  ].join('\n');
  const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });

  async function load() {
    [me, options, tokens] = await Promise.all([api.me(), api.options(), api.tokens()]);
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
      adding ? 'Password added.' : 'Password changed. Your other sessions are signed out, and your tokens revoked.',
    );
  }

  function createToken(e: SubmitEvent) {
    e.preventDefault();
    void act('cli', async () => {
      created = await api.createToken(tokenName.trim());
      tokenName = '';
      tokens = await api.tokens();
    });
  }

  const link = () =>
    act('sso', async () => {
      location.assign((await api.link()).url);
    });

  function confirmed() {
    const { section, run } = asking!;
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
            ? 'Changing it signs you out everywhere else, and revokes your command-line tokens.'
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
                (asking = {
                  section: 'password',
                  title: 'Remove your password?',
                  text: `You'll be able to sign in only with your identity provider, as ${me!.linked}.`,
                  action: 'Remove password',
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
                (asking = {
                  section: 'sso',
                  title: 'Unlink your identity provider?',
                  text: "You'll be able to sign in only with your password.",
                  action: 'Unlink',
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
      <h2>Command line and agents</h2>
      <p class="muted">
        The <code>reachline</code> command reads and changes your models from a terminal, so an AI agent can work on
        them too. It runs on macOS and Linux (on Windows, in WSL), and needs Node.js 22 or newer, and
        <code>~/.local/bin</code> on your <code>PATH</code>.
      </p>
      <pre>{setup}</pre>
      <p class="muted">
        Then <code>reachline help</code> lists what it does, and <code>reachline skill</code> gives an agent its instructions.
        An agent passes what it reads to whoever runs it, so give it only models you'd share with them.
      </p>

      <form class="token-form" onsubmit={createToken}>
        <div class="field">
          <label for="token-name">Token name</label>
          <input
            id="token-name"
            bind:value={tokenName}
            maxlength="100"
            autocomplete="off"
            aria-describedby="token-name-hint"
            required
          />
          <span class="hint" id="token-name-hint">Usually the computer it's for. A token reaches your models only.</span
          >
        </div>
        <div class="buttons"><button disabled={busy}>Create token</button></div>
      </form>
      {#if created}
        <div class="created">
          <label class="field"
            >Token for {created.name}
            <input class="mono" readonly value={created.token} onfocus={(e) => e.currentTarget.select()} />
          </label>
          <p class="notice" role="status">
            Copy it now, and paste it where <code>reachline login</code> asks: it can't be shown again.
          </p>
        </div>
      {/if}
      {@render feedback('cli')}

      {#if tokens.length}
        <ul class="tokens">
          {#each tokens as t (t.id)}
            <li>
              <div>
                <strong>{t.name}</strong>
                <span class="muted">Made {day(t.created)}; {t.used ? `last used ${day(t.used)}` : 'never used'}</span>
              </div>
              <button
                class="quiet danger"
                aria-label="Revoke {t.name}"
                disabled={busy}
                onclick={() =>
                  (asking = {
                    section: 'cli',
                    title: `Revoke ${t.name}?`,
                    text: 'Whatever uses it is signed out. Revisions it saved keep its name.',
                    action: 'Revoke',
                    run: async () => {
                      await api.revokeToken(t.id);
                      if (created?.id === t.id) created = undefined;
                      tokens = await api.tokens();
                    },
                  })}>Revoke</button
              >
            </li>
          {/each}
        </ul>
      {:else}
        <p class="muted">No tokens yet.</p>
      {/if}
    </section>

    <section class="card section">
      <h2>Delete account</h2>
      <p class="muted">Deletes your account and all of your models, with their history.</p>
      {@render feedback('delete')}
      <div>
        <button
          class="danger"
          disabled={busy}
          onclick={() =>
            (asking = {
              section: 'delete',
              title: 'Delete your account?',
              text: `This deletes ${user} and all of your models from this server, with their history. It can't be undone.`,
              action: 'Delete account',
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

<Confirm question={asking} onconfirm={confirmed} onclose={() => (asking = undefined)} />

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
  .section {
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
  .problem {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2) var(--space-3);
  }
  .hidden {
    display: none;
  }
  .token-form {
    display: flex;
    flex-wrap: wrap;
    align-items: start;
    gap: var(--space-3) var(--space-4);
  }
  .token-form .field {
    flex: 1 1 16rem;
  }
  .token-form .buttons {
    padding-top: var(--space-5);
  }
  .created {
    display: grid;
    gap: var(--space-2);
  }
  .tokens {
    display: grid;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .tokens li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2) var(--space-4);
    padding: var(--space-2) 0;
    border-top: 1px solid var(--border);
  }
  .tokens li > div {
    display: grid;
  }
</style>
