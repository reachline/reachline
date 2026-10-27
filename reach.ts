#!/usr/bin/env node
/*
Run the scenarios in a model: data/model.yml, or examples/model.yml if there's
no data/ (or whichever --model names).

    ./reach.ts                      every scenario
    ./reach.ts house_fire           one scenario
    ./reach.ts burglary mail        how the attacker (or I) reach one thing
    ./reach.ts --todo               open questions in the model
    ./reach.ts --plan plans/x.yml   before/after for every scenario
    ./reach.ts --model examples/model.yml   another model

    ./reach.ts --mermaid where              where everything lives (in/needs)
    ./reach.ts --mermaid mail               every way into one thing (AND/OR)
    ./reach.ts --mermaid mail --scenario house_fire   ...colored, with dead ends faded
    ./reach.ts --mermaid burglary           the one path a scenario uses to each item
    ./reach.ts --mermaid all > data/views.md   where + every scenario, as Markdown

--plan may repeat; plans apply in order on top of the model, and combine with
the other forms (a scenario name, an explain, --todo, --mermaid) to run against
the planned state. A plan path is taken as given if it exists, else relative to
the model's directory. For --mermaid on a thing, --scenario NAME colors it by
that scenario and fades every edge that can't carry access in it, and --depth N
stops N steps out (default 2; "all" for everything, which gets unreadable fast).

Each thing reached gets the smallest set of assumptions its path relies on:
unknowns ("?", a fact about the setup I don't know) and states (entries under
`states:`, conditions of the moment like "password manager unlocked on the
laptop"). Neither is assumed by default; a scenario can pin states with
`assume: [...]` (true) or `deny: [...]` (false). Results that rely on unknowns are UNSURE; results that
rely only on states DEPEND on them. Lockout scenarios list critical things I
can no longer reach, or only reach through assumptions, where that's worse than
baseline. Breach scenarios list sensitive things the attacker reaches, either
outright or through fewer assumptions than an attacker starting with nothing.

A plan uses the same sections as model.yml. For each thing it lists, the
fields given replace the model's (whole fields: restate the full access list);
a new id adds a thing, and `id: null` removes one. Scenarios merge the same
way, and a top-level `me` replaces the model's.

The engine itself is in engine/ and has no file access, so the UI in spike/
runs it in the browser.
*/
import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Model, ReachError } from './engine/model.ts';
import { mermaidAll, mermaidScenario, mermaidWaysIn, mermaidWhere } from './engine/mermaid.ts';
import { diff, explain, report, todo } from './engine/report.ts';

// The model and plans are personal, so they live in data/ (gitignored). Without
// one, the synthetic example stands in.
const ROOT = dirname(fileURLToPath(import.meta.url));
const DATA_MODEL = join(ROOT, 'data', 'model.yml');
const EXAMPLE_MODEL = join(ROOT, 'examples', 'model.yml');

// A plan path is taken as given if it exists, else relative to the model's directory.
const resolve = (path: string, dir: string) => (existsSync(path) || isAbsolute(path) ? path : join(dir, path));

function open(paths: string[]): Model {
  return new Model(paths.map((path) => {
    try {
      return { path, text: readFileSync(path, 'utf8') };
    } catch (e) {
      throw new ReachError(`${path}: ${(e as NodeJS.ErrnoException).code === 'ENOENT' ? 'no such file' : (e as Error).message}`);
    }
  }));
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
  if (what === 'all') return mermaidAll(m, plans.map((p) => basename(p)));
  if (m.scenarios.has(what)) return mermaidScenario(m, what);
  if (m.things.has(what)) {
    const depth = opts.get('--depth') ?? '2';
    if (depth !== 'all' && !/^\d+$/.test(depth)) throw new ReachError(`--depth: not a number or "all": ${depth}`);
    return mermaidWaysIn(m, what, opts.get('--scenario') ?? null, depth === 'all' ? null : Number(depth));
  }
  throw new ReachError(`${what}: not where, all, a scenario or a thing`);
}

function main(argv: string[]): string[] {
  let model = take(argv, '--model');
  if (model === undefined) {
    model = existsSync(DATA_MODEL) ? DATA_MODEL : EXAMPLE_MODEL;
    if (model === EXAMPLE_MODEL) process.stderr.write('no data/model.yml; using examples/model.yml\n');
  }
  const plans: string[] = [];
  for (let p; (p = take(argv, '--plan')) !== undefined; ) plans.push(resolve(p, dirname(model)));
  const opts = new Map<string, string>();
  for (const flag of ['--mermaid', '--scenario', '--depth']) {
    const v = take(argv, flag);
    if (v !== undefined) opts.set(flag, v);
  }
  const after = open([model, ...plans]);
  if (opts.has('--mermaid')) return [mermaid(after, opts.get('--mermaid')!, opts, plans)];
  if (argv[0] === '--todo') return todo(after);
  if (argv.length === 2 && !after.scenarios.has(argv[1])) {
    if (!after.things.has(argv[1])) throw new ReachError(`${argv[1]}: neither a scenario nor a thing`);
    return explain(after, argv[0], argv[1]);
  }
  const names = argv.length ? argv : [...after.scenarios.keys()];
  const unknown = names.filter((n) => !after.scenarios.has(n));
  if (unknown.length) throw new ReachError(`unknown scenario: ${unknown.join(', ')}`);
  if (plans.length) return diff(open([model]), after, names);
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
