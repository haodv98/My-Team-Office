import { expect, test } from 'vitest';
import { collectBacklog } from '../src/server/backlog.js';
import { CachedFetcher } from '../src/server/http.js';
import { fakeFetch } from './fakeFetch.js';

const B = 'https://demo.backlog.com/api/v2';
const cfg = { space: 'demo.backlog.com', apiKey: 'k', projectKey: 'DEMO' };
const since = new Date('2026-11-20T00:00:00Z');
const now = new Date('2026-11-27T05:00:00Z');

function issue(n: number, status: string, extra: Record<string, unknown> = {}) {
  return {
    id: 5000 + n,
    issueKey: `DEMO-${n}`,
    keyId: n,
    summary: `Task ${n}`,
    assignee: { id: 2 },
    status: { id: 1, name: status },
    milestone: [{ id: 77 }],
    updated: '2026-11-25T00:00:00Z',
    ...extra,
  };
}

function routes(extra: Record<string, unknown> = {}) {
  return {
    [`${B}/projects/DEMO?`]: { body: { id: 42 } },
    [`${B}/projects/DEMO/users`]: { body: [{ id: 2, name: 'Người B', nulabAccount: { iconUrl: 'https://x/b.png' } }] },
    [`${B}/projects/DEMO/versions`]: {
      body: [
        { id: 77, name: 'Đợt 1', startDate: '2026-11-20T00:00:00Z', releaseDueDate: '2026-12-03T00:00:00Z', archived: false },
        { id: 78, name: 'Cũ', startDate: '2026-10-01T00:00:00Z', releaseDueDate: '2026-10-09T00:00:00Z', archived: false },
      ],
    },
    [`${B}/projects/DEMO/statuses`]: {
      body: [
        { id: 1, name: 'Đang xử lý' },
        { id: 4, name: 'Đóng' },
        { id: 9, name: 'Chờ QA' },
      ],
    },
    [`${B}/issues?`]: { body: [issue(1, 'Đang xử lý'), issue(2, 'Chờ QA'), issue(3, 'Đóng')] },
    [`${B}/issues/DEMO-1/comments`]: {
      body: [{ id: 300, content: 'xem giúp', createdUser: { id: 1 }, created: '2026-11-26T00:00:00Z', notifications: [{ user: { id: 2 } }] }],
    },
    [`${B}/issues/DEMO-2/comments`]: { body: [] },
    ...extra,
  };
}

test('collectBacklog: notifications → notifiedIds; trạng thái tiếng Việt → bucket', async () => {
  const { impl } = fakeFetch(routes());
  const bl = await collectBacklog(new CachedFetcher({ fetchImpl: impl }), cfg, {}, since, now);
  const t1 = bl.tasks.find((t) => t.number === 1)!;
  expect(t1).toMatchObject({ key: 'DEMO-1', assigneeId: 2, bucket: 'doing', milestoneIds: [77], url: 'https://demo.backlog.com/view/DEMO-1' });
  expect(bl.tasks.find((t) => t.number === 3)!.bucket).toBe('closed');
  expect(bl.comments).toEqual([
    {
      id: 300,
      taskNumber: 1,
      authorId: 1,
      notifiedIds: [2],
      createdAt: '2026-11-26T00:00:00Z',
      body: 'xem giúp',
      url: 'https://demo.backlog.com/view/DEMO-1#comment-300',
    },
  ]);
  expect(bl.users).toEqual([{ id: 2, name: 'Người B', iconUrl: 'https://x/b.png' }]);
  expect(bl.milestones.map((m) => m.id)).toEqual([77, 78]);
});

test('collectBacklog: STATUS_MAP ghi đè tên tuỳ biến', async () => {
  const { impl } = fakeFetch(routes());
  const bl = await collectBacklog(new CachedFetcher({ fetchImpl: impl }), cfg, { 'Chờ QA': 'done' }, since, now);
  expect(bl.tasks.find((t) => t.number === 2)!.bucket).toBe('done');
});

test('không lấy comment của task đã đóng; truy vấn task theo trạng thái mở và milestone đang chạy', async () => {
  const { impl, calls } = fakeFetch(routes());
  await collectBacklog(new CachedFetcher({ fetchImpl: impl }), cfg, {}, since, now);
  expect(calls.some((c) => c.url.includes('DEMO-3/comments'))).toBe(false);
  const issueCalls = calls.filter((c) => c.url.startsWith(`${B}/issues?`)).map((c) => decodeURIComponent(c.url));
  expect(issueCalls.some((u) => u.includes('statusId[]=1') && u.includes('statusId[]=9') && !u.includes('statusId[]=4'))).toBe(true);
  expect(issueCalls.some((u) => u.includes('milestoneId[]=77') && !u.includes('milestoneId[]=78'))).toBe(true);
  expect(calls.every((c) => c.method === 'GET' && c.url.includes('apiKey=k'))).toBe(true);
});
