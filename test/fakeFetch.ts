// fetch giả: khớp theo đoạn đầu URL (bỏ query apiKey), ghi lại mọi lời gọi.
export interface FakeRoute {
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
}

export interface FakeCall {
  url: string;
  method: string;
  headers: Record<string, string>;
}

export function fakeFetch(routes: Record<string, FakeRoute | ((call: FakeCall) => FakeRoute)>) {
  const calls: FakeCall[] = [];
  const impl = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    const headers = Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>));
    const call = { url, method: init?.method ?? 'GET', headers };
    calls.push(call);
    // khớp dài nhất trước
    const key = Object.keys(routes)
      .filter((k) => url.startsWith(k))
      .sort((a, b) => b.length - a.length)[0];
    if (!key) return new Response('not found', { status: 404 });
    const r = routes[key]!;
    const route = typeof r === 'function' ? r(call) : r;
    const status = route.status ?? 200;
    return new Response(status === 304 ? null : JSON.stringify(route.body ?? null), {
      status,
      headers: route.headers ?? {},
    });
  }) as unknown as typeof fetch;
  return { impl, calls };
}
