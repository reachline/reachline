// The server, configured by the environment (see .env.template).
import { serve } from '@hono/node-server';
import { createApp } from './app.ts';
import { loadConfig, type Config } from './config.ts';
import { openStore, type Store } from './db.ts';

let config: Config;
try {
  config = loadConfig(process.env);
} catch (e) {
  console.error(`reachline: ${(e as Error).message}`);
  process.exit(1);
}

for (const warning of config.warnings) console.warn(`reachline: ${warning}`);

let store: Store;
try {
  store = openStore(config.dataDir);
} catch (e) {
  const who = process.getuid ? `${process.getuid()}:${process.getgid!()}` : 'this user';
  console.error(
    `reachline: can't open the database in ${config.dataDir}, which ${who} must be able to write: ${(e as Error).message}`,
  );
  process.exit(1);
}
store.deleteExpiredSessions();
const server = serve({ fetch: createApp(store, config).fetch, hostname: config.host, port: config.port }, () => {
  console.log(`ReachLine at ${config.publicUrl.origin}, listening on ${config.host}:${config.port}`);
});

// As PID 1 in a container, Node would otherwise ignore SIGTERM.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    server.close(() => {
      store.db.close();
      process.exit(0);
    });
  });
}
