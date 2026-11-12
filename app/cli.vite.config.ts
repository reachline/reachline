// Bundles the command line, with the engine, `yaml`, the docs and the skill,
// into dist/reachline.mjs, which the server hands out.
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { DOCS, SKILL } from '../cli/docs.ts';

const at = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const DOCS_MODULE = at('../cli/docs.ts');

export default defineConfig({
  plugins: [
    {
      name: 'reachline-docs',
      // The docs inline, in place of reading them from the repository.
      load: (id) =>
        id === DOCS_MODULE
          ? `export const DOCS = ${JSON.stringify(DOCS)};\nexport const SKILL = ${JSON.stringify(SKILL)};`
          : undefined,
    },
  ],
  publicDir: false,
  build: {
    ssr: at('../reachline.ts'),
    outDir: at('dist'),
    emptyOutDir: false,
    target: 'node22',
    minify: false,
    rollupOptions: { output: { entryFileNames: 'reachline.mjs' } },
  },
  ssr: { noExternal: true },
});
