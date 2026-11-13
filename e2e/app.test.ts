// The production build, served by the real server, in Chromium: what only a
// real browser can show. Each test starts a new user in a browser of their own
// on the example model, and fails on anything that breaks the strict CSP (the
// graph lays out in the ELK worker); the last ones run axe.
//
//   pnpm build && pnpm exec playwright install chromium-headless-shell && pnpm test:e2e
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { AxeBuilder } from '@axe-core/playwright';
import { chromium, type Browser, type BrowserContextOptions, type Locator, type Page } from 'playwright';
import { ROOT } from '../server/config.ts';

const PORT = 5298;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const PHONE = { width: 390, height: 844 };
const dataDir = mkdtempSync(join(tmpdir(), 'reachline-e2e-'));
const server = spawn(process.execPath, ['server/main.ts'], {
  cwd: ROOT,
  env: { ...process.env, HOST: '127.0.0.1', PORT: String(PORT), PUBLIC_URL: ORIGIN, DATA_DIR: dataDir },
  stdio: 'inherit',
});
let browser: Browser;
let users = 0;

/** Chooses a kind from the one KindSelect in `within`, as with the pointer. */
async function chooseKind(within: Locator, kind: string) {
  await within.getByRole('combobox').click();
  await within.page().getByRole('option', { name: kind, exact: true }).click();
}

/**
 * Signs a new user up, in a browser of their own so that nothing another test
 * kept carries over, and opens the example as their first model. `problems`
 * collects what breaks the CSP or throws.
 */
async function openExample(options: BrowserContextOptions = {}) {
  const page = await (await browser.newContext(options)).newPage();
  const problems: string[] = [];
  page.on('console', (m) => {
    if (/Content.Security.Policy|CSP violation/i.test(m.text())) problems.push(m.text());
  });
  page.on('pageerror', (e) => problems.push(e.message));
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => {
      console.error(`CSP violation: ${e.violatedDirective} blocked ${e.blockedURI} at ${e.sourceFile}:${e.lineNumber}`);
    });
  });

  await page.goto(ORIGIN);
  await page.waitForURL(/\/login/);
  await page.getByRole('button', { name: 'Create an account' }).click();
  await page.getByLabel('Username').fill(`user${++users}`);
  await page.getByLabel('Password', { exact: true }).fill('password1');
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.getByRole('heading', { name: 'Your models' }).waitFor();
  await page.getByRole('button', { name: 'New model' }).click();
  await page.getByLabel('Name', { exact: true }).fill('example');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await page.waitForURL(/\/m\/\d+/);
  await chooseThing(page, 'documents');
  return { page, problems };
}

/** Shows the ways into a thing, from the toolbar's Thing picker. */
async function chooseThing(page: Page, id: string) {
  await page.getByRole('button', { name: /^Thing / }).click();
  await page.getByRole('button', { name: id, exact: true }).click();
  await page.locator('.svelte-flow__node').first().waitFor();
}

/** WCAG 2.2 AA, as far as axe can tell. */
async function passesAxe(page: Page, where: string) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const found = violations.map((v) => `${v.id} at ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
  assert.deepEqual(found, [], where);
}

const scrollsSideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);

before(async () => {
  assert.ok(existsSync(join(ROOT, 'app/dist/index.html')), 'run pnpm build first');
  for (let i = 0; ; i++) {
    if (
      await fetch(`${ORIGIN}/api/health`).then(
        (r) => r.ok,
        () => false,
      )
    )
      break;
    if (i === 50) throw new Error('the server did not start');
    await new Promise((r) => setTimeout(r, 100));
  }
  browser = await chromium.launch();
});

after(async () => {
  await browser.close();
  server.kill('SIGTERM');
  rmSync(dataDir, { recursive: true, force: true });
});

test('the graph, from the keyboard and the toolbar, and what a reload keeps', async () => {
  const { page, problems } = await openExample();

  // The graph works from the keyboard: Enter on a node selects it, Details shows its ways in, Escape clears it.
  const more = page.getByRole('group', { name: /has more ways in(,|$)/ }).first();
  const id = (await more.getAttribute('aria-label'))!.split(',')[0];
  const count = await page.locator('.svelte-flow__node').count();
  await more.focus();
  await page.keyboard.press('Enter');
  await page.getByRole('heading', { name: new RegExp(`^${id} `) }).waitFor();
  await page.getByRole('button', { name: 'Show ways in' }).click();
  await page.waitForFunction((n) => document.querySelectorAll('.svelte-flow__node').length > n, count);
  await page.getByRole('group', { name: new RegExp(`^${id},`) }).focus();
  await page.keyboard.press('Escape');
  await page.getByText(/^Select a node for its details/).waitFor();
  // Shift+Enter (or a double click) opens it to edit.
  await page.getByRole('group', { name: new RegExp(`^${id},`) }).focus();
  await page.keyboard.press('Shift+Enter');
  await page.getByRole('textbox', { name: 'Name', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  // The toolbar's Thing picker shows ways into a thing, and selects it; Enter takes the first match.
  await page.getByRole('button', { name: /^Thing / }).click();
  await page.getByRole('searchbox', { name: 'Filter' }).fill('mail_p');
  await page.keyboard.press('Enter');
  await page.getByRole('heading', { name: /^mail_pw / }).waitFor();
  // Closed, the panel's tabs float over the graph; the one pressed keeps the focus as they move.
  const details = page.getByRole('button', { name: 'Details', exact: true });
  await details.click();
  await page.locator('#panel').waitFor({ state: 'hidden' });
  assert.ok(await details.evaluate((b) => b === document.activeElement));
  await details.click();
  await page.locator('#panel').waitFor();

  await page.getByRole('button', { name: 'Tidy' }).click();
  await page.getByRole('button', { name: 'Where things live' }).click();
  await page.locator('.svelte-flow__node').first().waitFor();
  await page.getByRole('button', { name: 'Layout' }).click();
  await page.getByLabel('Direction').selectOption('DOWN');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Legend' }).click();
  await page.keyboard.press('Escape');

  // A save survives a reload.
  await page.getByRole('button', { name: 'Text', exact: true }).click();
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+Home');
  await page.keyboard.insertText('# saved\n');
  await page.keyboard.press('ControlOrMeta+s');
  await page.getByText('Saved', { exact: true }).waitFor();
  const edge = page.getByRole('separator', { name: 'Panel width' });
  await edge.focus();
  await page.keyboard.press('ArrowLeft');
  const width = await edge.getAttribute('aria-valuenow');
  await page.reload();
  // The panel opens as it was left: on the text, at the same width.
  await page.locator('.cm-content').getByText('# saved').waitFor();
  assert.equal(await edge.getAttribute('aria-valuenow'), width);
  assert.equal(width, '400');
  // So does the view (kept in the URL) and the layout (kept by the browser).
  assert.equal(await page.getByRole('button', { name: 'Where things live' }).getAttribute('aria-pressed'), 'true');
  assert.equal(await page.getByLabel('Direction').inputValue(), 'DOWN');

  // History compares the first revision with the text now, and restores it.
  await page.getByRole('button', { name: 'History' }).click();
  await page.getByRole('button', { name: /\(latest\)$/ }).waitFor();
  await page.locator('.history li button').last().click();
  await page.locator('.cm-changedLine').first().waitFor();
  await page.getByRole('button', { name: 'Restore this revision' }).click();
  await page.getByText('Same as the text now.').waitFor();
  await page.getByText('Saved', { exact: true }).waitFor();

  await page.getByRole('button', { name: 'example' }).click();
  await page.getByRole('link', { name: 'All models' }).click();
  // Opened from the list, with nothing in its link, the model comes back as it was left.
  await page.getByRole('link', { name: 'example' }).click();
  await page.locator('.svelte-flow__node').first().waitFor();
  assert.equal(await page.getByRole('button', { name: 'Where things live' }).getAttribute('aria-pressed'), 'true');
  assert.match(page.url(), /target=mail_pw/);
  // Every page's logo leads back to the models.
  await page.getByRole('banner').getByRole('link', { name: 'Your models' }).click();
  await page.getByRole('button', { name: /account menu/ }).click();
  await page.getByRole('link', { name: 'Account settings' }).click();
  await page.getByRole('heading', { name: 'Change password' }).waitFor();
  await page.getByRole('banner').getByRole('link', { name: 'Your models' }).click();
  await page.getByRole('link', { name: 'example' }).waitFor();
  await page.getByRole('button', { name: /account menu/ }).click();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.waitForURL(/\/login/);

  assert.deepEqual(problems, []);
});

test('the text editor', async () => {
  const { page, problems } = await openExample();
  const undo = page.getByRole('button', { name: 'Undo', exact: true });

  // The editor (loaded on demand) marks an error and the graph goes out of date until it's fixed.
  await page.getByRole('button', { name: 'Text', exact: true }).click();
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+Home');
  await page.keyboard.insertText('bogus: 1\n');
  await page.locator('.cm-lintRange-error').waitFor();
  await page.getByText('Out of date: the text has errors').waitFor();
  await page.keyboard.press('ControlOrMeta+Home');
  await page.keyboard.press('Shift+ArrowDown');
  await page.keyboard.press('Delete');
  await page.locator('.cm-lintRange-error').waitFor({ state: 'detached' });
  await page.getByText('Out of date').waitFor({ state: 'detached' });

  // Ids complete where the text refers to things.
  await page.keyboard.press('ControlOrMeta+Home');
  await page.keyboard.insertText('me: [ho');
  await page.locator('.cm-tooltip-autocomplete').getByText('home').waitFor();
  await page.keyboard.press('Escape');
  await page.keyboard.press('ControlOrMeta+z');
  await page.getByText('Saved', { exact: true }).waitFor();

  // Format drops a comment (which is warned about), and the header's Undo takes that back as one step.
  await page.keyboard.insertText('# gone\n');
  await page.locator('.cm-lintRange-warning').waitFor();
  await page.getByRole('button', { name: 'Format' }).click();
  await page.locator('.cm-content').getByText('# gone').waitFor({ state: 'detached' });
  await undo.click();
  await page.locator('.cm-content').getByText('# gone').waitFor();
  await undo.click();
  await page.getByText('Saved', { exact: true }).waitFor();

  // Find shows every match and steps through them; F12 on an id goes to where it's defined.
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+f');
  await page.keyboard.insertText('(mail_pw');
  await page.getByText(/^1 of 1$/).waitFor();
  await page.keyboard.press('Escape');
  await page.keyboard.press('F12');
  await page.locator('.cm-activeLine', { hasText: /^\s*mail_pw:/ }).waitFor();
  await page.getByRole('searchbox', { name: 'Find' }).fill('hw_key');
  await page.getByText(/^\d+ of \d+$/).waitFor();
  assert.ok((await page.locator('.cm-searchMatch').count()) > 1);
  // Folding everything (from the keyboard; the gutter folds one) hides all but the top level.
  await page.locator('.cm-content').click();
  await page.keyboard.press('Control+Alt+BracketLeft');
  await page.locator('.cm-content').getByText('laptop_unlocked').waitFor({ state: 'detached' });
  await page.keyboard.press('Control+Alt+BracketRight');
  await page.locator('.cm-content').getByText('laptop_unlocked').first().waitFor();

  assert.deepEqual(problems, []);
});

test('guided edits, plans and templates', async () => {
  const { page, problems } = await openExample();
  const undo = page.getByRole('button', { name: 'Undo', exact: true });

  // Add a thing, fill it in, rename it, delete it, and undo that.
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByRole('button', { name: 'Thing…' }).click();
  const add = page.getByRole('dialog', { name: 'Add a thing' });
  await add.getByLabel('Name').fill('tablet');
  await chooseKind(add, 'device');
  await add.getByRole('button', { name: 'Add', exact: true }).click();
  const addIn = page.getByRole('combobox', { name: 'Add to lives in', exact: true });
  await addIn.fill('home');
  await addIn.press('Enter');
  await page.getByRole('button', { name: 'Remove home from lives in' }).waitFor();
  // A condition completes the word at the caret, and offers to create what isn't a thing yet.
  const access = page.getByRole('combobox', { name: 'Accessed with', exact: true });
  await access.pressSequentially('tablet_pin or fa');
  await page
    .getByRole('listbox', { name: 'Things for accessed with' })
    .getByRole('option', { name: /^face/ })
    .waitFor();
  await access.press('ArrowDown');
  await access.press('Enter');
  await access.press('Enter');
  await chooseKind(page.getByRole('group', { name: 'New things' }), 'secret');
  await page.getByRole('button', { name: 'Create and add' }).click();
  // Now a thing, so the id fields suggest it.
  await addIn.fill('tablet_p');
  await page
    .getByRole('listbox', { name: 'Things to add to lives in' })
    .getByRole('option', { name: /^tablet_pin/ })
    .waitFor();
  await addIn.fill('');
  const name = page.getByRole('textbox', { name: 'Name', exact: true });
  await name.fill('slate');
  await name.blur();
  await page.getByRole('button', { name: 'Delete slate' }).click();
  const confirm = page.getByRole('dialog', { name: 'Delete slate?' });
  await confirm.getByText('removed').first().waitFor();
  await confirm.getByRole('button', { name: 'Delete' }).click();
  await page.getByText('Select a node to edit it').waitFor();
  await undo.click();
  await page.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('button', { name: 'Text', exact: true }).click();
  await page.locator('.cm-line', { hasText: /^\s*slate:/ }).waitFor();
  // Each guided edit was one step: four more undo the rename, the way in, the place, and the thing.
  for (let i = 0; i < 4; i++) await undo.click();
  await page.getByText('Saved', { exact: true }).waitFor();

  // Plans: one on shows what it changes; edits can go into it; applying it makes it part of the model.
  const plansPicker = page.getByRole('button', { name: /^Plans / });
  // In the Plans picker, which may be closed.
  const planBox = (name: string) => page.getByRole('checkbox', { name: new RegExp(`^${name}`), includeHidden: true });
  await plansPicker.click();
  await planBox('spare_key').check();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Plans', exact: true }).click();
  await page.locator('.verdicts li').first().waitFor();
  await page.getByRole('button', { name: 'Edits go into the model' }).click();
  await page.getByRole('button', { name: /^plan spare_key/ }).click();
  const into = page.getByRole('button', { name: 'Edits go into plan spare_key' });
  await into.waitFor();
  // Where edits go survives a reload.
  await page.reload();
  await into.waitFor();
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByRole('button', { name: 'Thing…' }).click();
  await add.getByLabel('Name').fill('key_drawer');
  await chooseKind(add, 'device');
  await add.getByRole('button', { name: 'Add' }).click();
  await page.getByText('Added by plan spare_key.').waitFor();
  await page.getByRole('button', { name: 'Plans', exact: true }).click();
  await page.getByRole('button', { name: 'Apply…' }).first().click();
  const applying = page.getByRole('dialog', { name: 'Apply spare_key?' });
  await applying.getByText('key_drawer').waitFor();
  await applying.getByRole('button', { name: 'Apply' }).click();
  await planBox('spare_key').waitFor({ state: 'detached' });
  await undo.click();
  await planBox('spare_key').waitFor({ state: 'attached' });
  await undo.click();
  await page.getByText('Saved', { exact: true }).waitFor();

  // Add makes a plan too: it's on, edits go into it, and its tab opens on its name and note.
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByRole('button', { name: 'Plan…' }).click();
  const addPlan = page.getByRole('dialog', { name: 'Add a plan' });
  await addPlan.getByLabel('Name').fill('new_plan');
  await addPlan.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByRole('heading', { name: 'new_plan plan' }).waitFor();
  await page.getByRole('textbox', { name: 'Note' }).waitFor();
  await page.getByRole('button', { name: 'Edits go into plan new_plan' }).waitFor();
  await undo.click();
  await page.getByText('Saved', { exact: true }).waitFor();
  // Nothing, the panel's tabs included, is wider than the window.
  assert.equal(await scrollsSideways(page), false);

  // A plan that doesn't load with the model (this one builds on spare_key) says why, and can be turned off.
  await page.getByRole('button', { name: 'Text', exact: true }).click();
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.insertText('  after_key:\n    things:\n      key_offsite: {in: [home]}\n');
  await page.getByRole('button', { name: 'Plans', exact: true }).click();
  const afterKey = planBox('after_key');
  await plansPicker.click();
  await afterKey.check();
  await page
    .getByRole('alert')
    .filter({ hasText: /don’t load with the model: .*key_offsite/ })
    .waitFor();
  await page.getByText('Out of date: the plans that are on don’t load').waitFor();
  await afterKey.uncheck();
  await page.getByText('Out of date').waitFor({ state: 'detached' });
  await page.keyboard.press('Escape');
  await undo.click();
  await page.getByText('Saved', { exact: true }).waitFor();

  // Templates: its slots take your things of the same name; it goes in as a plan, or into the model.
  const fromTemplate = page.getByRole('dialog', { name: 'Add from a template' });
  const github = page.getByRole('dialog', { name: 'GitHub' });
  const openGithub = async () => {
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await page.getByRole('button', { name: 'From a template…' }).click();
    await fromTemplate.getByLabel('Search').fill('git');
    await fromTemplate.getByRole('button', { name: /GitHub/ }).click();
    await github.getByLabel('Where the password is kept').and(page.locator('select')).waitFor();
    assert.equal(await github.getByLabel('Where the password is kept').inputValue(), 'vault');
  };
  await openGithub();
  await github.getByRole('button', { name: 'Add as a plan' }).click();
  await planBox('add_github').waitFor({ state: 'attached' });
  await undo.click();
  await planBox('add_github').waitFor({ state: 'detached' });
  await openGithub();
  await github.getByRole('button', { name: 'Add to model' }).click();
  await page.getByText('Added by plan').waitFor({ state: 'detached' });
  // In the Thing picker, closed or not.
  await page
    .getByRole('button', { name: 'github_pw', exact: true, includeHidden: true })
    .waitFor({ state: 'attached' });
  await undo.click();
  await page.getByText('Saved', { exact: true }).waitFor();

  assert.deepEqual(problems, []);
});

test('scenarios, and exporting the graph', async () => {
  const { page, problems } = await openExample();
  const undo = page.getByRole('button', { name: 'Undo', exact: true });

  // The tab shows the one chosen in the toolbar: its checked verdicts, then everything else it leaves worse off.
  const scenario = (name: string) => page.getByRole('button', { name: `Scenario ${name}`, exact: true });
  const chooseScenario = async (name: string) => {
    await page.getByRole('button', { name: /^Scenario / }).click();
    await page.getByRole('button', { name: new RegExp(`^${name} `) }).click();
  };
  await page.getByRole('button', { name: 'Scenario', exact: true }).click();
  await chooseScenario('burglary');
  await page.getByRole('heading', { name: /^burglary / }).waitFor();
  await chooseScenario('house_fire');
  await scenario('house_fire').waitFor();
  const verdicts = page.getByRole('region', { name: 'Worse off than on a normal day' });
  await verdicts
    .getByRole('listitem')
    .filter({ hasText: /^documents\s+LOST/ })
    .waitFor();
  await verdicts.getByText(/^Also affected \(/).click();
  await verdicts
    .getByRole('listitem')
    .filter({ hasText: /^laptop\s+LOST/ })
    .waitFor();
  // Editing there: a rename follows into the picker; the normal day edits what you have.
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const scenarioName = page.getByRole('textbox', { name: 'Scenario', exact: true });
  await scenarioName.fill('fire');
  await scenarioName.blur();
  await scenario('fire').waitFor();
  await chooseScenario('baseline');
  await page.getByRole('group', { name: 'On a normal day you have' }).waitFor();
  await undo.click();
  await page.getByText('Saved', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Done' }).click();

  // The graph exports; the PNG is the SVG drawn through a blob: image.
  for (const format of ['SVG', 'PNG']) {
    await page.getByRole('button', { name: 'Export' }).click();
    const [file] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: `${format} (the graph)` }).click(),
    ]);
    assert.ok(statSync(await file.path()).size > 1000, format);
  }

  assert.deepEqual(problems, []);
});

// In both themes. axe can't judge text drawn over the graph's SVG, so that
// needs checking by hand.
test('the pages pass axe', async () => {
  for (const colorScheme of ['light', 'dark'] as const) {
    const ctx = await browser.newContext({ colorScheme });
    const page = await ctx.newPage();
    const check = (where: string) => passesAxe(page, `${where}, ${colorScheme}`);

    await page.goto(ORIGIN);
    await page.getByLabel('Username').waitFor();
    await check('sign in');
    await page.getByRole('button', { name: 'Create an account' }).click();
    await check('create an account');
    await page.getByLabel('Username').fill(`axe-${colorScheme}`);
    await page.getByLabel('Password', { exact: true }).fill('password1');
    // The eye shows what's typed, pressed until it's hidden again.
    const reveal = page.getByRole('button', { name: 'Show password' });
    await reveal.click();
    assert.equal(await page.getByLabel('Password', { exact: true }).getAttribute('type'), 'text');
    assert.equal(await reveal.getAttribute('aria-pressed'), 'true');
    await page.getByRole('button', { name: 'Create account' }).click();
    await page.getByRole('heading', { name: 'Your models' }).waitFor();
    await check('no models');
    await page.getByRole('button', { name: 'New model' }).click();
    await page.getByLabel('Name', { exact: true }).fill('example');
    await check('new model');
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await page.waitForURL(/\/m\/\d+/);
    await page.getByText('Choose a thing to see the ways into it.').waitFor();
    await check('model, no thing chosen');
    await chooseThing(page, 'documents');
    await check('model');
    // Selected, a node shows its arrows, and Details what they do.
    await page.locator('.svelte-flow__node-thing').first().click();
    await page.locator('.node-arrow').first().waitFor();
    await check('a node selected');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Details', exact: true }).click();
    await check('the panel closed');
    await page.getByRole('button', { name: 'Details', exact: true }).click();
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await page.getByRole('button', { name: 'Thing…' }).click();
    await check('add a thing');
    const add = page.getByRole('dialog', { name: 'Add a thing' });
    await add.getByLabel('Name').fill('tablet');
    await chooseKind(add, 'device');
    await add.getByRole('button', { name: 'Add', exact: true }).click();
    await page.getByRole('textbox', { name: 'Name', exact: true }).waitFor();
    await check('editing a thing and a scenario');
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await page.getByText('Saved', { exact: true }).waitFor();
    await page.getByRole('button', { name: /^Thing / }).click();
    await check('choosing a thing');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: /^Plans / }).click();
    await page.getByRole('checkbox', { name: /^spare_key/ }).check();
    await check('choosing plans');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Plans', exact: true }).click();
    await page.locator('.verdicts li').first().waitFor();
    await check('plans');
    await page.getByRole('button', { name: 'Scenario', exact: true }).click();
    await page.getByRole('button', { name: /^Scenario / }).click();
    await page.getByRole('button', { name: /^house_fire / }).click();
    await page.getByText(/^Also affected \(/).click();
    await check('scenarios');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await page.getByRole('button', { name: 'From a template…' }).click();
    await page.getByRole('dialog', { name: 'Add from a template' }).waitFor();
    await check('templates');
    await page.getByRole('button', { name: /GitHub/ }).click();
    await page.getByRole('dialog', { name: 'GitHub' }).getByText('Adds').waitFor();
    await check('a template');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Text', exact: true }).click();
    await page.getByRole('searchbox', { name: 'Find' }).fill('home');
    await page.getByText(/^\d+ of \d+$/).waitFor();
    await check('the text, finding');
    await page.goBack();
    await page.getByRole('link', { name: 'example' }).waitFor();
    await check('models');
    await page.getByRole('button', { name: /account menu/ }).click();
    await check('user menu');
    await page.getByRole('link', { name: 'Account settings' }).click();
    await page.getByRole('heading', { name: 'Change password' }).waitFor();
    await check('account');
    await page.getByRole('button', { name: 'Delete account' }).click();
    await page.getByRole('dialog', { name: 'Delete your account?' }).waitFor();
    await check('confirm deleting the account');
    await page.getByRole('button', { name: 'Cancel' }).click();
    await ctx.close();
  }
});

// What the Account page says to do, done: a token from the link `reachline login`
// prints, then the command line the server hands out, signed in with it.
test('the Account page makes a token that the served command line signs in with', async () => {
  const { page, problems } = await openExample({ viewport: PHONE });
  await page.goto(`${ORIGIN}/account?new-token=e2e-laptop`);
  await page.getByRole('heading', { name: 'Command line and agents' }).waitFor();
  assert.equal(await page.getByLabel('Token name').inputValue(), 'e2e-laptop');
  await page.getByRole('button', { name: 'Create token' }).click();
  const token = await page.getByLabel('Token for e2e-laptop').inputValue();
  await page.getByRole('button', { name: 'Revoke e2e-laptop' }).waitFor();
  assert.equal(await scrollsSideways(page), false);
  await passesAxe(page, 'account, with a token, on a phone');
  assert.deepEqual(problems, []);

  const dir = mkdtempSync(join(tmpdir(), 'reachline-e2e-cli-'));
  const cli = join(dir, 'reachline.mjs');
  writeFileSync(cli, await (await fetch(`${ORIGIN}/reachline.mjs`)).text(), { mode: 0o755 });
  const run = (args: string[], input = '') =>
    spawnSync(process.execPath, [cli, ...args], {
      cwd: dir,
      input,
      encoding: 'utf8',
      env: { ...process.env, XDG_CONFIG_HOME: dir, REACHLINE_SERVER: '', REACHLINE_TOKEN: '' },
    });
  const login = run(['login', ORIGIN], `${token}\n`);
  assert.equal(login.status, 0, login.stderr);
  const models = run(['models']);
  assert.match(models.stdout, /^example\b/m);
  assert.doesNotMatch(models.stderr, /different version/, 'the server knows the CLI it hands out');
  assert.equal(run(['pull', 'example']).status, 0);
  assert.equal(run(['check', 'example.yml']).status, 0);

  // An older copy says so, and update brings it in line.
  writeFileSync(cli, `${readFileSync(cli, 'utf8')}// older\n`);
  assert.match(run(['models']).stderr, /different version/);
  assert.equal(run(['update']).status, 0);
  assert.doesNotMatch(run(['models']).stderr, /different version/);
  assert.match(run(['update']).stdout, /Already/);
  rmSync(dir, { recursive: true, force: true });
});

// Phones have a layout of their own: the toolbar, with where edits go, takes a
// row of its own, folded until it's opened, and the panel, open, covers the graph.
test('on a phone, nothing scrolls sideways and the model page passes axe', async () => {
  const { page, problems } = await openExample({ viewport: PHONE });
  // The graph clips its controls, so the page wouldn't scroll: they have to fit.
  const controls = await page.getByRole('group', { name: 'Graph controls' }).boundingBox();
  assert.ok(controls && controls.x + controls.width <= PHONE.width, 'the graph controls fit');
  await passesAxe(page, 'model, on a phone');
  // The example has plans, so where edits go is in the toolbar.
  await page.getByRole('button', { name: /^Ways in/, expanded: false }).click();
  await page.getByRole('button', { name: /^Edits go into / }).waitFor();
  assert.equal(await scrollsSideways(page), false);
  await passesAxe(page, 'model, the toolbar open, on a phone');
  await page.getByRole('button', { name: 'Details', exact: true }).click();
  await page.locator('#panel').waitFor();
  assert.equal(await scrollsSideways(page), false);
  await passesAxe(page, 'the panel, on a phone');

  assert.deepEqual(problems, []);
});
