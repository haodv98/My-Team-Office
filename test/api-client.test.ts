import { expect, test } from 'vitest';
import type { OfficeEvent, Snapshot } from '../src/shared/types.js';
import { connect } from '../src/web/api.js';

class FakeES {
  static last: FakeES;
  listeners: Record<string, ((e: { data: string }) => void)[]> = {};
  onerror: (() => void) | null = null;
  onopen: (() => void) | null = null;
  closed = false;
  constructor(public url: string) {
    FakeES.last = this;
  }
  addEventListener(type: string, fn: (e: { data: string }) => void) {
    (this.listeners[type] ??= []).push(fn);
  }
  emit(type: string, data: unknown) {
    for (const fn of this.listeners[type] ?? []) fn({ data: JSON.stringify(data) });
  }
  close() {
    this.closed = true;
  }
}

const snap = (generatedAt: string) => ({ version: 1, generatedAt }) as Snapshot;
const tick = () => new Promise((r) => setTimeout(r, 0));

test('nối lại SSE (hello) → tải lại snapshot đúng một lần, không nhân đôi', async () => {
  let gen = '2026-11-21T05:00:00Z';
  let fetches = 0;
  const fetchImpl = (async () => {
    fetches++;
    return new Response(JSON.stringify(snap(gen)), { status: 200 });
  }) as unknown as typeof fetch;
  const got: Snapshot[] = [];
  const stop = connect(
    { onSnapshot: (s) => got.push(s), onEvent: () => {}, onStatus: () => {} },
    { EventSource: FakeES as unknown as typeof EventSource, fetch: fetchImpl },
  );
  await tick();
  expect(fetches).toBe(1);
  FakeES.last.emit('hello', { generatedAt: gen });
  FakeES.last.emit('hello', { generatedAt: gen });
  await tick();
  expect(fetches).toBe(1);
  gen = '2026-11-21T05:01:00Z';
  FakeES.last.emit('snapshot', { generatedAt: gen });
  await tick();
  expect(fetches).toBe(2);
  expect(got.map((s) => s.generatedAt)).toEqual(['2026-11-21T05:00:00Z', '2026-11-21T05:01:00Z']);
  stop();
  expect(FakeES.last.closed).toBe(true);
});

test('sự kiện office chuyển cho onEvent; lỗi kết nối báo offline', async () => {
  const fetchImpl = (async () => new Response(JSON.stringify(snap('x')), { status: 200 })) as unknown as typeof fetch;
  const events: OfficeEvent[] = [];
  const status: boolean[] = [];
  connect(
    { onSnapshot: () => {}, onEvent: (e) => events.push(e), onStatus: (s) => status.push(s) },
    { EventSource: FakeES as unknown as typeof EventSource, fetch: fetchImpl },
  );
  FakeES.last.emit('office', { id: 'e1' });
  FakeES.last.onerror?.();
  expect(events.map((e) => e.id)).toEqual(['e1']);
  expect(status).toContain(false);
});

test('snapshot 503 → thử lại, không gọi onSnapshot', async () => {
  const fetchImpl = (async () => new Response('{}', { status: 503 })) as unknown as typeof fetch;
  const got: Snapshot[] = [];
  connect({ onSnapshot: (s) => got.push(s), onEvent: () => {}, onStatus: () => {} }, { EventSource: FakeES as unknown as typeof EventSource, fetch: fetchImpl, retryMs: 1_000_000 });
  await tick();
  expect(got).toEqual([]);
});
