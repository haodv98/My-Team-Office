// fetch chỉ-đọc có nhớ ETag (304 không tốn hạn mức GitHub) và hỗ trợ proxy.
import { fetch as undiciFetch, ProxyAgent } from 'undici';

export type Source = 'github' | 'backlog';

/** Bỏ apiKey / token khỏi URL trước khi đưa vào log hoặc thông báo lỗi. */
export function redactUrl(url: string): string {
  return url.replace(/([?&]apiKey=)[^&]*/i, '$1***');
}

export class SourceError extends Error {
  constructor(
    readonly source: Source,
    readonly status: number,
    url: string,
  ) {
    super(`${source} trả lỗi ${status || 'mạng'} cho ${redactUrl(url)}`);
    this.name = 'SourceError';
  }
}

const REQUEST_TIMEOUT_MS = 20_000;

const sourceOf = (url: string): Source => (new URL(url).hostname === 'api.github.com' ? 'github' : 'backlog');

function nextLink(link: string | null): string | null {
  if (!link) return null;
  const m = /<([^>]+)>\s*;\s*rel="next"/.exec(link);
  return m?.[1] ?? null;
}

interface CacheEntry {
  etag: string;
  body: unknown;
  next: string | null;
}

export class CachedFetcher {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly fetchImpl: typeof fetch;

  constructor(opts: { proxy?: string; fetchImpl?: typeof fetch } = {}) {
    if (opts.fetchImpl) {
      this.fetchImpl = opts.fetchImpl;
    } else {
      const dispatcher = opts.proxy ? new ProxyAgent(opts.proxy) : undefined;
      this.fetchImpl = ((input: string, init?: RequestInit) =>
        undiciFetch(input, { ...(init as object), ...(dispatcher ? { dispatcher } : {}) })) as unknown as typeof fetch;
    }
  }

  async getJson<T>(url: string, headers: Record<string, string> = {}): Promise<T> {
    return (await this.getPage<T>(url, headers)).data;
  }

  /** Như getJson, kèm URL trang kế tiếp từ header Link (GitHub). */
  async getPage<T>(url: string, headers: Record<string, string> = {}): Promise<{ data: T; next: string | null }> {
    const cached = this.cache.get(url);
    const h: Record<string, string> = { Accept: 'application/json', ...headers };
    if (cached) h['If-None-Match'] = cached.etag;
    let res: Response;
    try {
      res = await this.fetchImpl(url, { method: 'GET', headers: h, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    } catch {
      throw new SourceError(sourceOf(url), 0, url);
    }
    if (res.status === 304 && cached) return { data: cached.body as T, next: cached.next };
    if (res.status >= 400 || res.status === 304) throw new SourceError(sourceOf(url), res.status, url);
    const data = (await res.json()) as T;
    const next = nextLink(res.headers.get('link'));
    const etag = res.headers.get('etag');
    if (etag) this.cache.set(url, { etag, body: data, next });
    return { data, next };
  }
}
