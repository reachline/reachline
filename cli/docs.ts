// What `reachline docs` and `reachline skill` print. Read from the repository
// here; the bundle the server hands out has them inline (app/cli.vite.config.ts).
import { readdirSync, readFileSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url);
const text = (path: string) => readFileSync(new URL(path, ROOT), 'utf8');

/** The user guide in docs/, by name (`concepts` for docs/concepts.md); not self-hosting. */
export const DOCS: Record<string, string> = Object.fromEntries(
  readdirSync(new URL('docs/', ROOT))
    .filter((f) => f.endsWith('.md'))
    .map((f) => [f.slice(0, -3), text(`docs/${f}`)]),
);

export const SKILL = text('cli/SKILL.md');
