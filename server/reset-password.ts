#!/usr/bin/env node
// Gives a user a new random password, prints it, and ends their sessions.
//
//   docker exec <container> reset-password <username>
//   pnpm reset-password <username>          outside Docker, with .env's DATA_DIR
import { randomPassword, hashPassword } from './auth.ts';
import { loadConfig } from './config.ts';
import { openStore } from './db.ts';

const name = process.argv[2]?.toLowerCase();
if (!name || process.argv.length > 3) {
  console.error('usage: reset-password <username>');
  process.exit(2);
}

const store = openStore(loadConfig(process.env).dataDir);
const user = store.userByName(name);
if (!user) {
  console.error(`reset-password: no user named ${name}`);
  process.exit(1);
}
const password = randomPassword();
store.setPassword(user.id, await hashPassword(password));
store.deleteSessions(user.id);
console.log(`New password for ${name}: ${password}`);
