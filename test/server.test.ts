import { afterEach, expect, test } from 'vitest';
import type { Snapshot } from '../src/shared/types.js';
import { buildServer } from '../src/server/server.js';

const snap: Snapshot = {
  version: 1,
  generatedAt: '2026-11-21T05:00:00.000Z',
  desks: [],
  unassigned: { prs: [], waits: [] },
  teamWaits: [],
  progress: [],
  events: [],
  staleSources: [],
  unmappedLogins: [],
  unmappedMembers: [],
};

let close: (() => Promise<unknown>) | undefined;
afterEach(async () => {
  await close?.();
  close = undefined;
});

test('chưa có snapshot → 503 kèm thông báo', async () => {
  const { app } = buildServer({ getSnapshot: () => null });
  close = () => app.close();
  const r = await app.inject('/api/snapshot');
  expect(r.statusCode).toBe(503);
  expect(r.json()).toEqual({ message: 'Đang lấy dữ liệu lần đầu, thử lại sau ít giây.' });
});

test('/api/snapshot trả snapshot, không lộ seen', async () => {
  const { app } = buildServer({ getSnapshot: () => ({ ...snap, seen: { x: 1 } }) as unknown as Snapshot });
  close = () => app.close();
  const body = (await app.inject('/api/snapshot')).json();
  expect(body.generatedAt).toBe(snap.generatedAt);
  expect(body).not.toHaveProperty('seen');
});

test('SSE: hello khi nối, snapshot + office khi broadcast', async () => {
  const { app, broadcast } = buildServer({ getSnapshot: () => snap });
  close = () => app.close();
  await app.listen({ port: 0, host: '127.0.0.1' });
  const addr = app.server.address() as { port: number };
  const ctrl = new AbortController();
  const res = await fetch(`http://127.0.0.1:${addr.port}/api/events`, { signal: ctrl.signal });
  expect(res.headers.get('content-type')).toContain('text/event-stream');
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let text = '';
  const readUntil = async (needle: string) => {
    while (!text.includes(needle)) text += dec.decode((await reader.read()).value);
  };
  await readUntil('event: hello');
  broadcast({ ...snap, generatedAt: '2026-11-21T05:01:00.000Z' }, [
    { id: 'e1', type: 'pr_opened', at: '2026-11-21T05:00:30.000Z', from: 'a', to: ['a'], title: 't', url: 'u' },
  ]);
  await readUntil('event: office');
  expect(text).toContain('event: snapshot\ndata: {"generatedAt":"2026-11-21T05:01:00.000Z","rev":"2026-11-21T05:01:00.000Z"}');
  expect(text).toContain('"id":"e1"');
  ctrl.abort();
});
