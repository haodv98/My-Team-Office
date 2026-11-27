// Điểm vào: đọc cấu hình, chạy polling, mở HTTP.
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.js';
import { startPoller } from './poller.js';
import { buildServer } from './server.js';

const cfg = loadConfig(process.env);
const staticDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'web');

let poller: ReturnType<typeof startPoller> | undefined;
const { app, broadcast } = buildServer({ getSnapshot: () => poller?.current() ?? null, staticDir });
poller = startPoller(cfg, broadcast);
await poller.ready;

await app.listen({ host: '0.0.0.0', port: cfg.port });
console.log(JSON.stringify({ level: 'info', msg: 'My Team Office đang chạy', port: cfg.port, repos: cfg.github.repos.length }));

const shutdown = async () => {
  poller?.stop();
  await app.close();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
