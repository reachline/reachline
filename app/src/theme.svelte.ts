// Light, dark or the system's, for this device.
import { keep, load } from './prefs';

export type Theme = 'light' | 'dark' | 'system';

const stored = load('theme');
let current = $state<Theme>(stored === 'light' || stored === 'dark' ? stored : 'system');

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
    keep('theme', t === 'system' ? undefined : t);
  },
};
