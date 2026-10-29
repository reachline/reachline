// The production build, served by the real server, in Chromium: nothing may
// break the strict CSP while a new user signs up, creates a model from the
// example and opens its graph (which lays out in the ELK worker).
//
//   pnpm build && pnpm exec playwright install chromium-headless-shell && pnpm test:csp
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
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

  await page.getByLabel('Name', { exact: true }).fill('example');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await page.waitForURL(/\/m\/\d+/);
  await page.locator('.svelte-flow__node').first().waitFor();
  await page.getByRole('button', { name: 'Tidy' }).click();
  await page.getByRole('combobox', { name: /^View/ }).selectOption('where');
  await page.locator('.svelte-flow__node').first().waitFor();

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
  await page.getByRole('button', { name: 'Saved' }).waitFor();
  await page.reload();
  await page.getByRole('button', { name: 'Text' }).click();
  await page.locator('.cm-content').getByText('# saved').waitFor();

  // History compares the first revision with the text now, and restores it.
  await page.getByRole('button', { name: 'History' }).click();
  await page.getByRole('button', { name: /\(latest\)$/ }).waitFor();
  await page.locator('.history li button').last().click();
  await page.locator('.cm-changedLine').first().waitFor();
  await page.getByRole('button', { name: 'Restore this revision' }).click();
  await page.getByText('Same as the text now.').waitFor();
  await page.getByRole('button', { name: 'Saved' }).waitFor();

  // Ids complete where the text refers to things.
  await page.getByRole('button', { name: 'Text' }).click();
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+Home');
  await page.keyboard.insertText('me: [ho');
  await page.locator('.cm-tooltip-autocomplete').getByText('home').waitFor();
  await page.keyboard.press('Escape');
  await page.keyboard.press('ControlOrMeta+z');
  await page.getByRole('button', { name: 'Saved' }).waitFor();

  // The graph exports; the PNG is the SVG drawn through a blob: image.
  for (const format of ['SVG', 'PNG']) {
    await page.getByText('Export', { exact: true }).click();
    const [file] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: `${format} (the graph)` }).click(),
    ]);
    assert.ok(statSync(await file.path()).size > 1000, format);
  }

  await page.getByRole('link', { name: '← Models' }).click();
  await page.getByRole('link', { name: 'example' }).waitFor();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.waitForURL(/\/login/);

  assert.deepEqual(problems, []);
});
