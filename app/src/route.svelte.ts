// The page's path as state: /login, / (the model picker) and /m/:id. Links go
// through follow() so moving between pages doesn't reload the app.

let path = $state(location.pathname);
addEventListener('popstate', () => (path = location.pathname));

export const route = {
  get path() {
    return path;
  },
};

export function go(to: string, replace = false) {
  if (replace) history.replaceState(null, '', to);
  else history.pushState(null, '', to);
  path = location.pathname;
}

/** An <a> click handler; modified clicks (new tab and the like) still go to the browser. */
export function follow(e: MouseEvent) {
  if (e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  go((e.currentTarget as HTMLAnchorElement).getAttribute('href')!);
}

/** To the login page, coming back here afterwards. */
export function toLogin() {
  if (path !== '/login') go(`/login?next=${encodeURIComponent(location.pathname + location.search)}`, true);
}

/** Where to go after signing in: ?next= if it's a path on this site. */
export function afterLogin(): string {
  /* eslint-disable svelte/prefer-svelte-reactivity -- read once, never kept as state */
  const next = new URLSearchParams(location.search).get('next') ?? '/';
  const url = new URL(next, location.origin);
  /* eslint-enable svelte/prefer-svelte-reactivity */
  return url.origin === location.origin && url.pathname !== '/login' ? url.pathname + url.search : '/';
}
