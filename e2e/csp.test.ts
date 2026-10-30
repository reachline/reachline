// The production build, served by the real server, in Chromium: nothing may
// break the strict CSP while a new user signs up, creates a model from the
// example and opens its graph (which lays out in the ELK worker); and the
// pages pass axe's accessibility checks.
//
//   pnpm build && pnpm exec playwright install chromium-headless-shell && pnpm test:csp
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { AxeBuilder } from '@axe-core/playwright';
import { chromium, type Browser } from 'playwright';
import { ROOT } from '../server/config.ts';

const PORT = 5298;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const dataDir = mkdtempSync(join(tmpdir(), 'reachline-e2e-'));
const server = spawn(process.execPath, ['server/main.ts'], {
  cwd: ROOT,
  env: { ...process.env, HOST: '127.0.0.1', PORT: String(PORT), PUBLIC_URL: ORIGIN, DATA_DIR: dataDir },
  stdio: 'inherit',
});
let browser: Browser;

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

test('sign up, create a model and see its graph, under the strict CSP', async () => {
  const page = await browser.newPage();
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
  await page.getByLabel('Username').fill('alice');
  await page.getByLabel('Password').fill('password1');
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.getByRole('heading', { name: 'Your models' }).waitFor();

  await page.getByRole('button', { name: 'New model' }).click();
  await page.getByLabel('Name', { exact: true }).fill('example');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await page.waitForURL(/\/m\/\d+/);
  await page.locator('.svelte-flow__node').first().waitFor();

  // The graph works from the keyboard: Enter on a node selects it and shows its ways in; Escape clears it.
  const more = page.getByRole('group', { name: /has more ways in$/ }).first();
  const id = (await more.getAttribute('aria-label'))!.split(',')[0];
  const count = await page.locator('.svelte-flow__node').count();
  await more.focus();
  await page.keyboard.press('Enter');
  await page.getByRole('heading', { name: new RegExp(`^${id} `) }).waitFor();
  await page.waitForFunction((n) => document.querySelectorAll('.svelte-flow__node').length > n, count);
  await page.getByRole('group', { name: new RegExp(`^${id},`) }).focus();
  await page.keyboard.press('Escape');
  await page.getByText('Select a node for its details.').waitFor();

  await page.getByRole('button', { name: 'Tidy' }).click();
  await page.getByRole('button', { name: 'Where things live' }).click();
  await page.locator('.svelte-flow__node').first().waitFor();
  await page.getByRole('button', { name: 'Layout' }).click();
  await page.getByLabel('Direction').selectOption('DOWN');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Legend' }).click();
  await page.keyboard.press('Escape');

  // The editor (loaded on demand) marks an error and the graph goes out of date until it's fixed.
  await page.getByRole('button', { name: 'Text' }).click();
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

  // A save survives a reload.
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

  // History compares the first revision with the text now, and restores it.
  await page.getByRole('button', { name: 'History' }).click();
  await page.getByRole('button', { name: /\(latest\)$/ }).waitFor();
  await page.locator('.history li button').last().click();
  await page.locator('.cm-changedLine').first().waitFor();
  await page.getByRole('button', { name: 'Restore this revision' }).click();
  await page.getByText('Same as the text now.').waitFor();
  await page.getByText('Saved', { exact: true }).waitFor();

  // Ids complete where the text refers to things.
  await page.getByRole('button', { name: 'Text' }).click();
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+Home');
  await page.keyboard.insertText('me: [ho');
  await page.locator('.cm-tooltip-autocomplete').getByText('home').waitFor();
  await page.keyboard.press('Escape');
  await page.keyboard.press('ControlOrMeta+z');
  await page.getByText('Saved', { exact: true }).waitFor();

  // The graph exports; the PNG is the SVG drawn through a blob: image.
  for (const format of ['SVG', 'PNG']) {
    await page.getByRole('button', { name: 'Export' }).click();
    const [file] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: `${format} (the graph)` }).click(),
    ]);
    assert.ok(statSync(await file.path()).size > 1000, format);
  }

  await page.getByRole('button', { name: 'example' }).click();
  await page.getByRole('link', { name: 'All models' }).click();
  await page.getByRole('link', { name: 'example' }).waitFor();
  await page.getByRole('button', { name: /account menu/ }).click();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.waitForURL(/\/login/);

  assert.deepEqual(problems, []);
});

// WCAG 2.2 AA, as far as axe can tell, in both themes. axe can't judge text
// drawn over the graph's SVG, so that needs checking by hand.
test('the pages pass axe', async () => {
  for (const colorScheme of ['light', 'dark'] as const) {
    const ctx = await browser.newContext({ colorScheme });
    const page = await ctx.newPage();
    const check = async (where: string) => {
      const { violations } = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();
      const found = violations.map((v) => `${v.id} at ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
      assert.deepEqual(found, [], `${where}, ${colorScheme}`);
    };

    await page.goto(ORIGIN);
    await page.getByLabel('Username').waitFor();
    await check('sign in');
    await page.getByRole('button', { name: 'Create an account' }).click();
    await check('create an account');
    await page.getByLabel('Username').fill(`axe-${colorScheme}`);
    await page.getByLabel('Password').fill('password1');
    await page.getByRole('button', { name: 'Create account' }).click();
    await page.getByRole('heading', { name: 'Your models' }).waitFor();
    await check('no models');
    await page.getByRole('button', { name: 'New model' }).click();
    await page.getByLabel('Name', { exact: true }).fill('example');
    await check('new model');
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await page.waitForURL(/\/m\/\d+/);
    await page.locator('.svelte-flow__node').first().waitFor();
    await check('model');
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
