// Recreates .dev/ with a `dev` user and the example model. It ignores DATA_DIR
// on purpose: a reset must never reach a real database.
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { hashPassword } from './auth.ts';
import { ROOT } from './config.ts';
import { openStore } from './db.ts';

const DIR = join(ROOT, '.dev');
const USER = 'dev';
const PASSWORD = 'dev-password';

rmSync(DIR, { recursive: true, force: true });
const store = openStore(DIR);
const userId = store.createUser(USER, await hashPassword(PASSWORD));
store.createModel(userId, 'example', readFileSync(join(ROOT, 'examples/model.yml'), 'utf8'));
store.db.close();
console.log(`Reset ${DIR}: sign in as ${USER} / ${PASSWORD}. Restart pnpm dev if it's running.`);
