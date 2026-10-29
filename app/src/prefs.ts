// Settings for this device, such as the theme and the panel, kept in the
// browser. Never anything from a model: models are sensitive, and stay on the
// server. Storage can be missing or refuse (private windows), so a setting
// that can't be read is undefined, and one that can't be kept just isn't.

export function load(key: string): unknown {
  try {
    const v = localStorage.getItem(key);
    return v === null ? undefined : JSON.parse(v);
  } catch {
    return undefined;
  }
}

export function keep(key: string, value: unknown) {
  try {
    if (value === undefined) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Not kept, then.
  }
}
