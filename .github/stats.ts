// Numbers for the README's badges, published with the docs as stats.json:
//   node .github/stats.ts site/stats.json
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

// Non-blank lines of source; not tests, config, YAML or prose.
function code(): string {
  const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
    .split('\0')
    .filter((f) => /\.(ts|svelte|css|js)$/.test(f) && !/\.config\.[jt]s$/.test(f) && !/^(test|e2e)\//.test(f));
  let n = 0;
  for (const f of files)
    n += readFileSync(f, 'utf8')
      .split('\n')
      .filter((l) => l.trim()).length;
  return n < 1000 ? String(n) : `${(n / 1000).toFixed(1)}k`;
}

const stats = { code: code() };
const out = process.argv[2];
if (out) writeFileSync(out, JSON.stringify(stats) + '\n');
else console.log(stats);
