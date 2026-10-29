// Light, dark or the system's. A setting for this device, so it's kept in the
// browser; it says nothing about anyone's model.

export type Theme = 'light' | 'dark' | 'system';

const KEY = 'theme';

function stored(): Theme {
  try {
    const t = localStorage.getItem(KEY);
    return t === 'light' || t === 'dark' ? t : 'system';
  } catch {
    return 'system';
  }
}

let current = $state<Theme>(stored());

function apply() {
  if (current === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = current;
}
apply();

export const theme = {
  get value() {
    return current;
  },
  set value(t: Theme) {
    current = t;
    apply();
    try {
      if (t === 'system') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, t);
    } catch {
      // Not kept, then: it still applies until the page reloads.
    }
  },
};
