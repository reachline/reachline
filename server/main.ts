// The server, configured by the environment (see .env.template).
import { serve } from '@hono/node-server';
import { createApp } from './app.ts';
import { loadConfig, type Config } from './config.ts';
import { openStore, type Store } from './db.ts';
import { log, setLevel } from './log.ts';

let config: Config;
try {
  config = loadConfig(process.env);
} catch (e) {
  log.error((e as Error).message);
  process.exit(1);
}
setLevel(config.logLevel);

for (const warning of config.warnings) log.warn(warning);

let store: Store;
try {
  store = openStore(config.dataDir);
} catch (e) {
  const who = process.getuid ? `${process.getuid()}:${process.getgid!()}` : 'this user';
  log.error(`can't open the database in ${config.dataDir}, which ${who} must be able to write`, {
    error: (e as Error).message,
  });
  process.exit(1);
}
store.deleteExpiredSessions();
const server = serve({ fetch: createApp(store, config).fetch, hostname: config.host, port: config.port }, () => {
  log.info(`ReachLine at ${config.publicUrl.origin}, listening on ${config.host}:${config.port}`, {
    auth: [config.password && 'password', config.oidc && 'oidc'].filter(Boolean).join(','),
    registration: config.registration ? 'open' : 'closed',
    level: config.logLevel,
  });
});

// As PID 1 in a container, Node would otherwise ignore SIGTERM.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    log.info('shutting down', { signal });
    server.close(() => {
      store.db.close();
      process.exit(0);
    });
  });
}
