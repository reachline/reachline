#!/usr/bin/env node
/*
Run the scenarios in a model: data/model.yml, or examples/model.yml if there's
no data/ (or whichever --model names).

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
    ./reach.ts --mermaid all > data/views.md   where + every scenario, as Markdown

--plan names a plan under the model's `plans:` and may repeat; plans apply in
order on top of the model, and combine with the other forms (a scenario name,
an explain, --todo, --mermaid) to run against the planned state. For --mermaid
on a thing, --scenario NAME colors it by that scenario and fades every edge
that can't carry access in it, and --depth N stops N steps out (default 2;
"all" for everything, which gets unreadable fast).

Each thing reached gets the smallest set of assumptions its path relies on:
unknowns (`unknown`, a fact about the setup I don't know) and states (things of
kind `state`, conditions of the moment like "password manager unlocked on the
laptop"). Neither is assumed by default; a scenario can pin states with
`assume: [...]` (true) or `deny: [...]` (false). Results that rely on unknowns
are UNSURE; results that rely only on states DEPEND on them.

`check: [lockout, breach]` marks what I care about for its own sake (mail,
documents, money), not the keys and devices that lead to it; the engine follows
those. Lockout scenarios list checked things I can no longer reach, or only
through assumptions, where that's worse than on a normal day. Breach scenarios
list checked things the attacker reaches, either outright or through fewer
assumptions than an attacker starting with nothing.

The normal day is built in as the scenario `baseline`: `me` (what I have
without getting it through anything else, such as head, body, carried and
home), with nothing lost.

A plan has the same `things`, `scenarios` and `me` as the model. For each thing
it lists, the fields given replace the model's (whole fields: restate the whole
condition); a new id adds a thing, and `id: null` removes one. Scenarios merge
the same way, and a plan's `me` replaces the model's.

The engine itself is in engine/ and has no file access, so the UI in app/
runs it in the browser.
*/
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Model, ReachError, type Source } from './engine/model.ts';
import { mermaidAll, mermaidScenario, mermaidWaysIn, mermaidWhere } from './engine/mermaid.ts';
import { diff, explain, report, todo } from './engine/report.ts';

// The model is personal, so it lives in data/ (gitignored). Without one, the
// synthetic example stands in.
const ROOT = dirname(fileURLToPath(import.meta.url));
const DATA_MODEL = join(ROOT, 'data', 'model.yml');
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
  let model = take(argv, '--model');
  if (model === undefined) {
    model = existsSync(DATA_MODEL) ? DATA_MODEL : EXAMPLE_MODEL;
    if (model === EXAMPLE_MODEL) process.stderr.write('no data/model.yml; using examples/model.yml\n');
  }
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
