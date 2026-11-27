// HTTP: /api/snapshot, /api/events (SSE), trang tĩnh.
import { existsSync } from 'node:fs';
import type { ServerResponse } from 'node:http';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import type { OfficeEvent, Snapshot } from '../shared/types.js';

const PING_MS = 25_000;

/** Snapshot gửi cho trình duyệt — bỏ mọi trường nội bộ ngoài kiểu Snapshot. */
function publicSnapshot(s: Snapshot): Snapshot {
  const { version, generatedAt, desks, unassigned, teamWaits, progress, events, staleSources, unmappedLogins, unmappedMembers } = s;
  return { version, generatedAt, desks, unassigned, teamWaits, progress, events, staleSources, unmappedLogins, unmappedMembers };
}

export function buildServer(opts: { getSnapshot: () => Snapshot | null; staticDir?: string }): {
  app: FastifyInstance;
  broadcast(s: Snapshot, fresh: OfficeEvent[]): void;
} {
  const app = Fastify({ logger: false });
  const clients = new Set<ServerResponse>();
  const send = (res: ServerResponse, event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  app.get('/api/snapshot', async (_req, reply) => {
    const s = opts.getSnapshot();
    if (!s) return reply.code(503).send({ message: 'Đang lấy dữ liệu lần đầu, thử lại sau ít giây.' });
    return publicSnapshot(s);
  });

  app.get('/api/events', (req, reply) => {
    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    send(res, 'hello', { generatedAt: opts.getSnapshot()?.generatedAt ?? null });
    clients.add(res);
    const ping = setInterval(() => res.write(': ping\n\n'), PING_MS);
    req.raw.on('close', () => {
      clearInterval(ping);
      clients.delete(res);
    });
  });

  app.addHook('onClose', async () => {
    for (const res of clients) res.end();
    clients.clear();
  });

  if (opts.staticDir && existsSync(opts.staticDir)) {
    void app.register(fastifyStatic, { root: opts.staticDir });
    app.get('/list', (_req, reply) => reply.sendFile('list.html'));
  }

  return {
    app,
    broadcast(s, fresh) {
      for (const res of clients) {
        send(res, 'snapshot', { generatedAt: s.generatedAt });
        for (const e of fresh) send(res, 'office', e);
      }
    },
  };
}
