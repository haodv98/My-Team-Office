// Kết nối tới server: tải snapshot, nghe sự kiện SSE, tự nối lại.
import type { OfficeEvent, Snapshot } from '../shared/types.js';

export interface Handlers {
  onSnapshot(s: Snapshot): void;
  onEvent(e: OfficeEvent): void;
  onStatus(online: boolean): void;
}

export interface ConnectDeps {
  EventSource?: typeof EventSource;
  fetch?: typeof fetch;
  retryMs?: number;
}

export function connect(h: Handlers, deps: ConnectDeps = {}): () => void {
  const ES = deps.EventSource ?? globalThis.EventSource;
  const doFetch = deps.fetch ?? globalThis.fetch.bind(globalThis);
  const retryMs = deps.retryMs ?? 5000;
  let current: string | null = null;
  let loading: string | null = null;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  const load = async (expected: string | null) => {
    if (stopped || (expected !== null && (expected === current || expected === loading))) return;
    loading = expected ?? '*';
    try {
      const res = await doFetch('/api/snapshot');
      if (!res.ok) throw new Error(String(res.status));
      const s = (await res.json()) as Snapshot;
      if (s.generatedAt !== current) {
        current = s.generatedAt;
        h.onSnapshot(s);
      }
    } catch {
      clearTimeout(retry);
      if (!stopped) retry = setTimeout(() => void load(null), retryMs);
    } finally {
      loading = null;
    }
  };

  const es = new ES('/api/events');
  const parse = (e: { data: string }) => JSON.parse(e.data) as Record<string, unknown>;
  es.onopen = () => h.onStatus(true);
  es.onerror = () => h.onStatus(false);
  es.addEventListener('hello', (e) => {
    h.onStatus(true);
    const g = parse(e as MessageEvent).generatedAt as string | null;
    void load(g ?? null);
  });
  es.addEventListener('snapshot', (e) => void load(parse(e as MessageEvent).generatedAt as string));
  es.addEventListener('office', (e) => h.onEvent(parse(e as MessageEvent) as unknown as OfficeEvent));
  void load(null);

  return () => {
    stopped = true;
    clearTimeout(retry);
    es.close();
  };
}
