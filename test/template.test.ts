// Templates: every one in templates/ is well-formed and loads, whatever is
// chosen; choices bind slots, rename by prefix, and leave out what isn't set up.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parse, stringify } from 'yaml';
import { Model } from '../engine/model.ts';
import { instantiate, readTemplate, type Choices, type Template } from '../app/src/template.ts';

const DIR = new URL('../templates/', import.meta.url);
const templates = readdirSync(DIR)
  .filter((f) => f.endsWith('.yml'))
  .map((f) => readTemplate(f.slice(0, -4), readFileSync(new URL(f, DIR), 'utf8')));
const github = templates.find((t) => t.id === 'github')!;

const choices = (t: Template, over: Partial<Choices> = {}): Choices => ({
  prefix: t.prefix,
  slots: {},
  include: new Set(t.optional.filter((o) => o.on).map((o) => o.id)),
  ...over,
});
const load = (things: object) => new Model({ path: 't.yml', text: stringify({ things }) });

test('every template loads, with every option and with none', () => {
  assert.ok(templates.length >= 3);
  for (const t of templates) {
    load(t.things);
    for (const include of [new Set(t.optional.map((o) => o.id)), new Set<string>()]) {
      load(instantiate(t, choices(t, { include })));
    }
  }
});

test('every template adds to the starter model, its slots bound to the starter’s things', () => {
  const starter = parse(readFileSync(new URL('../examples/starter.yml', import.meta.url), 'utf8')) as {
    things: Record<string, unknown>;
  };
  for (const t of templates) {
    const slots = Object.fromEntries(t.slots.map((s) => [s.id, s.id in starter.things ? s.id : null]));
    const things = instantiate(t, choices(t, { slots }));
    assert.deepEqual(
      Object.keys(things).filter((id) => id in starter.things),
      [],
    );
    load({ ...starter.things, ...things });
  }
});

test('a service with no second factor set up asks for the password alone', () => {
  const things = instantiate(github, choices(github, { include: new Set() }));
  assert.equal(things.github.access, 'github_pw or mail');
  assert.equal(things.github.recovery, undefined);
  // What nothing needs any more isn't created.
  assert.ok(!('hw_key' in things) && !('phone_unlocked' in things));
});

test('slots bind to your things, and the prefix renames what is the template’s', () => {
  const things = instantiate(github, choices(github, { prefix: 'github_work', slots: { vault: 'my_vault' } }));
  assert.ok(!('vault' in things) && !('github' in things));
  assert.deepEqual(things.github_work_pw.in, ['my_vault']);
  // By default only the authenticator app: an `or` of one is just it, and the passkey's way in goes.
  assert.equal(things.github_work.access, '(github_work_pw or mail) and github_work_totp');
});
