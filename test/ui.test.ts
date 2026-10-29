// The UI's colours all live in app/src/app.css, so no component can drift
// from the shared palette or miss the dark theme; and there, in both themes,
// they meet WCAG's contrast minimums. axe checks the pages, but can't see
// text and lines drawn over the graph's SVG; this covers those too.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const SRC = new URL('../app/src/', import.meta.url);
const COLOUR = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color-mix|light-dark)\(/i;

test('components take their colours from app.css', () => {
  const found = readdirSync(SRC, { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('.svelte'))
    .flatMap((f) =>
      readFileSync(new URL(f, SRC), 'utf8')
        .split('\n')
        .flatMap((line, i) => (COLOUR.test(line) ? [`${f}:${i + 1}: ${line.trim()}`] : [])),
    );
  assert.deepEqual(found, []);
});

/** Each colour defined as light-dark(#light, #dark), by its variable's name. */
const PAIRS = new Map(
  [
    ...readFileSync(new URL('app.css', SRC), 'utf8').matchAll(
      /--([\w-]+):\s*light-dark\((#[0-9a-f]{6}),\s*(#[0-9a-f]{6})\)/gi,
    ),
  ].map((m) => [m[1], [m[2], m[3]]] as const),
);

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** The pairs, in either theme, below `min`. */
function below(min: number, pairs: [string, string][]) {
  return pairs.flatMap(([fg, bg]) =>
    [0, 1].flatMap((theme) => {
      const [a, b] = [PAIRS.get(fg), PAIRS.get(bg)];
      assert.ok(a && b, `${fg} and ${bg} are light-dark() pairs of hex colours`);
      const r = ratio(a[theme], b[theme]);
      return r < min ? [`${fg} on ${bg} (${theme ? 'dark' : 'light'}): ${r.toFixed(2)}`] : [];
    }),
  );
}

test('text has a contrast of at least 4.5:1 (WCAG 1.4.3)', () => {
  const text: [string, string][] = [
    ...['bg', 'surface', 'good-fill', 'bad-fill', 'maybe-fill'].map((bg): [string, string] => ['text', bg]),
    ['muted', 'bg'],
    ['muted', 'surface'],
    ['accent', 'bg'],
    ['accent', 'surface'],
    ['accent', 'selected'],
    ['on-accent', 'accent'],
    ['danger', 'surface'],
    ['danger', 'danger-bg'],
    ['warning', 'warning-bg'],
    ['warning', 'maybe-fill'],
    ['gone-text', 'gone-fill'],
    ['start-text', 'start-fill'],
  ];
  assert.deepEqual(below(4.5, text), []);
});

test('fields, focus and what the graph draws have a contrast of at least 3:1 (WCAG 1.4.11)', () => {
  const graph = [...PAIRS.keys()].filter((k) => /^(k|e)-|-stroke$/.test(k));
  const lines: [string, string][] = [
    ['control-border', 'field'],
    ['control-border', 'surface'],
    ['focus', 'bg'],
    ['focus', 'surface'],
    ...graph.map((k): [string, string] => [k, 'bg']),
  ];
  assert.ok(graph.length >= 20, 'every graph colour is checked');
  assert.deepEqual(below(3, lines), []);
});
