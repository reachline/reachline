// The server, configured by the environment (see .env.template).
import { serve } from '@hono/node-server';
import { createApp } from './app.ts';
import { loadConfig, type Config } from './config.ts';
import { openStore } from './db.ts';

let config: Config;
try {
  config = loadConfig(process.env);
} catch (e) {
  console.error(`reachline: ${(e as Error).message}`);
  process.exit(1);
}

const store = openStore(config.dataDir);
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
