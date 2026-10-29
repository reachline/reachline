<script lang="ts">
  import Account from './Account.svelte';
  import { api, ApiFailure, message } from './api';
  import App from './App.svelte';
  import Login from './Login.svelte';
  import Models from './Models.svelte';
  import { afterLogin, follow, go, route, toLogin } from './route.svelte.ts';

  // undefined while asking the server; null when signed out.
  let user = $state<string | null | undefined>(undefined);
  let error = $state('');

  api.me().then(
    (me) => (user = me.username),
    (e: unknown) => {
      if (e instanceof ApiFailure && e.status === 401) user = null;
      else error = message(e);
    },
  );

  $effect(() => {
    if (user === null) toLogin();
    else if (user && route.path === '/login') go(afterLogin(), true);
  });

  function signedIn(name: string) {
    user = name;
  }

  function signedOut() {
    user = null;
  }

  const modelId = $derived(/^\/m\/([1-9]\d*)$/.exec(route.path)?.[1]);
</script>

{#if error}
  <p class="status">{error}</p>
{:else if route.path === '/login'}
  {#if user === null}<Login onsignin={signedIn} />{/if}
{:else if !user}
  <p class="status">Loading…</p>
{:else if modelId}
  {#key modelId}<App id={Number(modelId)} {user} onsignout={signedOut} />{/key}
{:else if route.path === '/'}
  <Models {user} onsignout={signedOut} />
{:else if route.path === '/account'}
  <Account {user} onsignout={signedOut} />
{:else}
  <p class="status">Not found. <a href="/" onclick={follow}>Your models</a></p>
{/if}
