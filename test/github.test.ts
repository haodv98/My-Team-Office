import { expect, test } from 'vitest';
import { collectGithub } from '../src/server/github.js';
import { CachedFetcher } from '../src/server/http.js';
import { fakeFetch } from './fakeFetch.js';

const API = 'https://api.github.com/repos/o/r';
const since = new Date('2026-11-20T00:00:00Z');

function ghPull(n: number, extra: Record<string, unknown> = {}) {
  return {
    number: n,
    title: `feat: ${n}`,
    head: { ref: `feat/${n}-x` },
    body: null,
    user: { login: 'user-a' },
    draft: false,
    created_at: '2026-11-21T00:00:00Z',
    closed_at: null,
    merged_at: null,
    requested_reviewers: [{ login: 'user-b' }],
    requested_teams: [{ slug: 'qa' }],
    html_url: `https://github.com/o/r/pull/${n}`,
    ...extra,
  };
}

test('304 trả lại body đã nhớ, có gửi If-None-Match', async () => {
  let n = 0;
  const { impl, calls } = fakeFetch({
    'https://api.github.com/x': () => (++n === 1 ? { body: { a: 1 }, headers: { etag: '"x"' } } : { status: 304 }),
  });
  const f = new CachedFetcher({ fetchImpl: impl });
  expect(await f.getJson('https://api.github.com/x')).toEqual({ a: 1 });
  expect(await f.getJson('https://api.github.com/x')).toEqual({ a: 1 });
  expect(calls[1]!.headers['If-None-Match']).toBe('"x"');
});

test('403 ném SourceError github', async () => {
  const { impl } = fakeFetch({ 'https://api.github.com/x': { status: 403 } });
  const f = new CachedFetcher({ fetchImpl: impl });
  await expect(f.getJson('https://api.github.com/x')).rejects.toMatchObject({ source: 'github', status: 403 });
});

test('lỗi mạng ném SourceError status 0', async () => {
  const f = new CachedFetcher({
    fetchImpl: (async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch,
  });
  await expect(f.getJson('https://demo.backlog.com/api/v2/x')).rejects.toMatchObject({ source: 'backlog', status: 0 });
});

test('collectGithub: merged_at → state merged, gộp reviews/comments', async () => {
  const { impl } = fakeFetch({
    [`${API}/pulls?state=open`]: { body: [ghPull(1)] },
    [`${API}/pulls?state=closed`]: {
      body: [
        ghPull(2, { closed_at: '2026-11-22T00:00:00Z', merged_at: '2026-11-22T00:00:00Z' }),
        ghPull(3, { closed_at: '2026-11-01T00:00:00Z' }),
      ],
    },
    [`${API}/pulls/1/reviews`]: {
      body: [
        { id: 9, user: { login: 'user-b' }, state: 'CHANGES_REQUESTED', submitted_at: '2026-11-21T02:00:00Z', body: 'sửa' },
        { id: 10, user: { login: 'user-b' }, state: 'PENDING', submitted_at: null, body: '' },
      ],
    },
    [`${API}/pulls/1/comments`]: {
      body: [{ id: 11, user: { login: 'user-b' }, body: 'x', created_at: '2026-11-21T03:00:00Z', html_url: 'u11' }],
    },
    [`${API}/issues/1/comments`]: {
      body: [{ id: 12, user: { login: 'user-a' }, body: 'y', created_at: '2026-11-21T04:00:00Z', html_url: 'u12' }],
    },
  });
  const gh = await collectGithub(new CachedFetcher({ fetchImpl: impl }), { token: 't', repos: ['o/r'] }, since);
  const open = gh.pulls.find((p) => p.number === 1)!;
  expect(open).toMatchObject({ repo: 'o/r', state: 'open', branch: 'feat/1-x', body: '', requestedReviewers: ['user-b'], requestedTeams: ['qa'] });
  expect(open.reviews).toHaveLength(1);
  expect(open.comments.map((c) => c.id)).toEqual([11, 12]);
  expect(gh.pulls.find((p) => p.number === 2)!.state).toBe('merged');
  expect(gh.pulls.some((p) => p.number === 3)).toBe(false);
});

test('collectGithub đi hết phân trang theo Link', async () => {
  const page1 = Array.from({ length: 100 }, (_, i) => ghPull(i + 1));
  const { impl } = fakeFetch({
    [`${API}/pulls?state=open&per_page=100&page=2`]: { body: [ghPull(101)] },
    [`${API}/pulls?state=open`]: {
      body: page1,
      headers: { link: `<${API}/pulls?state=open&per_page=100&page=2>; rel="next"` },
    },
    [`${API}/pulls?state=closed`]: { body: [] },
    [`${API}/pulls/`]: { body: [] },
    [`${API}/issues/`]: { body: [] },
  });
  const gh = await collectGithub(new CachedFetcher({ fetchImpl: impl }), { token: 't', repos: ['o/r'] }, since);
  expect(gh.pulls).toHaveLength(101);
});

test('chỉ gọi GET, có Authorization', async () => {
  const { impl, calls } = fakeFetch({ [`${API}/`]: { body: [] } });
  await collectGithub(new CachedFetcher({ fetchImpl: impl }), { token: 't', repos: ['o/r'] }, since);
  expect(calls.length).toBeGreaterThan(0);
  expect(calls.every((c) => c.method === 'GET')).toBe(true);
  expect(calls[0]!.headers.Authorization).toBe('Bearer t');
});
