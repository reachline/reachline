// The UI's colours all live in app/src/app.css, so no component can drift
// from the shared palette or miss the dark theme.
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
