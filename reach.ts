#!/usr/bin/env node
/*
Run the scenarios in a model: examples/model.yml, or whichever --model names.

    ./reach.ts                      every scenario
    ./reach.ts house_fire           one scenario
    ./reach.ts burglary mail        how the attacker (or I) reach one thing
    ./reach.ts --todo               open questions in the model
    ./reach.ts --plan spare_key     before/after for every scenario
    ./reach.ts --model examples/model.yml   another model

    ./reach.ts --mermaid where              where everything lives (in/needs)
    ./reach.ts --mermaid mail               every way into one thing (AND/OR)
    ./reach.ts --mermaid mail --scenario house_fire   ...colored, with dead ends faded
    ./reach.ts --mermaid burglary           the one path a scenario uses to each item
    ./reach.ts --mermaid all > views.md        where + every scenario, as Markdown

--plan names a plan under the model's `plans:` and may repeat; plans apply in
order on top of the model, and combine with the other forms (a scenario name,
an explain, --todo, --mermaid) to run against the planned state. For --mermaid
on a thing, --scenario NAME colors it by that scenario and fades every edge
that can't carry access in it, and --depth N stops N steps out (default 2;
"all" for everything, which gets unreadable fast).

What the model's fields and the verdicts mean: docs/ (start at docs/index.md).

The engine itself is in engine/ and has no file access, so the UI in app/
runs it in the browser.
*/
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Model, ReachError, type Source } from './engine/model.ts';
import { mermaidAll, mermaidScenario, mermaidWaysIn, mermaidWhere } from './engine/mermaid.ts';
import { diff, explain, report, todo } from './engine/report.ts';

const ROOT = dirname(fileURLToPath(import.meta.url));
const EXAMPLE_MODEL = join(ROOT, 'examples', 'model.yml');

function read(path: string): Source {
  try {
    return { path, text: readFileSync(path, 'utf8') };
  } catch (e) {
    throw new ReachError(
      `${path}: ${(e as NodeJS.ErrnoException).code === 'ENOENT' ? 'no such file' : (e as Error).message}`,
    );
  }
}

/** Remove `flag value` from argv and return the value. */
function take(argv: string[], flag: string): string | undefined {
  const i = argv.indexOf(flag);
  if (i < 0) return undefined;
  if (i + 1 >= argv.length) throw new ReachError(`${flag} needs a value`);
  return argv.splice(i, 2)[1];
}

function mermaid(m: Model, what: string, opts: Map<string, string>, plans: string[]): string {
  if (what === 'where') return mermaidWhere(m);
  if (what === 'all') return mermaidAll(m, plans);
  if (m.scenarios.has(what)) return mermaidScenario(m, what);
  if (m.things.has(what)) {
    const depth = opts.get('--depth') ?? '2';
    if (depth !== 'all' && !/^\d+$/.test(depth)) throw new ReachError(`--depth: not a number or "all": ${depth}`);
    return mermaidWaysIn(m, what, opts.get('--scenario') ?? null, depth === 'all' ? null : Number(depth));
  }
  throw new ReachError(`${what}: not where, all, a scenario or a thing`);
}

function main(argv: string[]): string[] {
  const model = take(argv, '--model') ?? EXAMPLE_MODEL;
  const plans: string[] = [];
  for (let p; (p = take(argv, '--plan')) !== undefined;) plans.push(p);
  const opts = new Map<string, string>();
  for (const flag of ['--mermaid', '--scenario', '--depth']) {
    const v = take(argv, flag);
    if (v !== undefined) opts.set(flag, v);
  }
  const source = read(model);
  const after = new Model(source, plans);
  if (opts.has('--mermaid')) return [mermaid(after, opts.get('--mermaid')!, opts, plans)];
  if (argv[0] === '--todo') return todo(after);
  if (argv.length === 2 && !after.scenarios.has(argv[1])) {
    if (!after.things.has(argv[1])) throw new ReachError(`${argv[1]}: neither a scenario nor a thing`);
    return explain(after, argv[0], argv[1]);
  }
  const names = argv.length ? argv : [...after.scenarios.keys()];
  const unknown = names.filter((n) => !after.scenarios.has(n));
  if (unknown.length) throw new ReachError(`unknown scenario: ${unknown.join(', ')}`);
  if (plans.length) return diff(new Model(source), after, names);
  return names.flatMap((name) => report(after, name));
}

try {
  const lines = main(process.argv.slice(2));
  if (lines.length) process.stdout.write(lines.join('\n') + '\n');
} catch (e) {
  if (!(e instanceof ReachError)) throw e;
  process.stderr.write(e.message + '\n');
  process.exitCode = 1;
}
