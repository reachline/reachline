#!/usr/bin/env node
// The command line: the engine on a model file, and the commands that move a
// model between that file and your server (cli/). The engine itself is in
// engine/ and has no file access, so the UI in app/ runs it in the browser.
// The server hands out a bundle of this (app/cli.vite.config.ts).
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COMMANDS, HELP, read } from './cli/commands.ts';
import { BUNDLED } from './cli/server.ts';
import { Model, ReachError } from './engine/model.ts';
import { diff, explain, report, todo } from './engine/report.ts';

// Run from the repository, the example is the default model.
const EXAMPLE_MODEL = join(dirname(fileURLToPath(import.meta.url)), 'examples', 'model.yml');

/** Remove `flag value` from argv and return the value. */
function take(argv: string[], flag: string): string | undefined {
  const i = argv.indexOf(flag);
  if (i < 0) return undefined;
  if (i + 1 >= argv.length) throw new ReachError(`${flag} needs a value`);
  return argv.splice(i, 2)[1];
}

/** The reports on a model file: scenarios, explain, --todo and --plan. */
function reports(argv: string[]): string[] {
  const model = take(argv, '--model') ?? (BUNDLED ? undefined : EXAMPLE_MODEL);
  if (model === undefined) throw new ReachError('Name a model file with --model FILE (reachline help for more)');
  const plans: string[] = [];
  for (let p; (p = take(argv, '--plan')) !== undefined;) plans.push(p);
  // `--` lets a scenario share its name with a command.
  const word = argv.at(0);
  if (word === '--') argv.shift();
  else if (word !== undefined && Object.hasOwn(COMMANDS, word))
    throw new ReachError(
      `${word} is a command, so it goes first (reachline ${word} ...). For a scenario named ${word}, put -- before it.`,
    );
  const source = read(model);
  const after = new Model(source, plans);
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

async function main(argv: string[]): Promise<string[]> {
  const first = argv.at(0);
  if (first !== undefined && Object.hasOwn(COMMANDS, first)) return COMMANDS[first](argv.slice(1));
  if (first === '--help' || (BUNDLED && first === undefined)) return [HELP];
  return reports(argv);
}

try {
  const lines = await main(process.argv.slice(2));
  if (lines.length) process.stdout.write(lines.join('\n') + '\n');
} catch (e) {
  if (!(e instanceof ReachError)) throw e;
  process.stderr.write(e.message + '\n');
  process.exitCode = 1;
}
