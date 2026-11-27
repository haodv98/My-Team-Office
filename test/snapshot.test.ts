import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import type { BacklogData, GithubData, OfficeEvent } from '../src/shared/types.js';
import { buildSnapshot, diffEvents, mergeEvents, readStore, writeStore } from '../src/server/snapshot.js';
import { makeBacklogComment, makeComment, makeMember, makePr, makeReview, makeTask } from './fixtures.js';

const a = makeMember({ key: 'a', display: 'An', github: ['user-a'], backlogUserId: 1, role: 'dev' });
const b = makeMember({ key: 'b', display: 'Bình', github: ['user-b'], backlogUserId: 2, role: 'dev' });
const c = makeMember({ key: 'c', display: 'Chi', github: [], backlogUserId: 3, role: 'qs' });
const members = [a, b, c];
const now = new Date('2026-11-21T05:00:00Z');
const ctx = { projectKey: 'DEMO', agentMarkers: ['Generated with Claude Code'], now };
const users = [
  { id: 1, name: 'An', iconUrl: 'https://x/icon.png' },
  { id: 2, name: 'Bình' },
  { id: 3, name: 'Chi' },
];
const bl = (p: Partial<BacklogData> = {}): BacklogData => ({ users, milestones: [], tasks: [], comments: [], ...p });
const gh = (...pulls: GithubData['pulls']): GithubData => ({ pulls });

test('người không task, không GitHub vẫn có bàn; sắp theo role rồi tên', () => {
  const s = buildSnapshot(gh(), bl(), members, ctx);
  expect(s.desks.map((d) => d.member.key)).toEqual(['a', 'b', 'c']);
  expect(s.desks.find((d) => d.member.key === 'c')).toMatchObject({ doingTasks: [], prs: [], waits: [] });
});

test('ảnh đại diện lấy từ iconUrl Backlog', () => {
  const s = buildSnapshot(gh(), bl(), members, ctx);
  expect(s.desks[0]!.member.avatarUrl).toBe('https://x/icon.png');
});

test('người Backlog thiếu trong members.yaml → bàn tạm bl-<id>, ghi vào unmappedMembers', () => {
  const s = buildSnapshot(gh(), bl({ users: [...users, { id: 9, name: 'Dũng' }] }), members, ctx);
  expect(s.desks.find((d) => d.member.key === 'bl-9')?.member).toMatchObject({ display: 'Dũng', role: 'khac', github: [] });
  expect(s.unmappedMembers).toEqual(['Dũng']);
});

test('task đang xử lý, PR gán theo task, mục chờ về đúng bàn', () => {
  const t1 = makeTask({ number: 612, assigneeId: 3, bucket: 'doing', updatedAt: '2026-11-20T00:00:00Z' });
  const t2 = makeTask({ number: 613, assigneeId: 3, bucket: 'doing', updatedAt: '2026-11-21T00:00:00Z' });
  const t3 = makeTask({ number: 614, assigneeId: 3, bucket: 'todo' });
  const t4 = makeTask({ number: 615, assigneeId: 3, bucket: 'closed' });
  const pr = makePr({ number: 5, author: 'user-a', branch: 'feat/612-x', requestedReviewers: ['user-b'] });
  const s = buildSnapshot(gh(pr), bl({ tasks: [t1, t2, t3, t4] }), members, ctx);
  const deskC = s.desks.find((d) => d.member.key === 'c')!;
  expect(deskC.doingTasks.map((t) => t.number)).toEqual([613, 612]);
  expect(deskC.otherTasks.map((t) => t.number)).toEqual([614]);
  expect(deskC.prs).toEqual([expect.objectContaining({ number: 5, taskNumbers: [612] })]);
  expect(s.desks.find((d) => d.member.key === 'b')!.waits.map((w) => w.kind)).toEqual(['review']);
});

test('PR của login lạ → unassigned, login vào unmappedLogins', () => {
  const s = buildSnapshot(gh(makePr({ author: 'Ghost', comments: [makeComment({ author: 'zed' })] })), bl(), members, ctx);
  expect(s.unassigned.prs).toHaveLength(1);
  expect(s.unmappedLogins).toEqual(['ghost', 'zed']);
});

test('lần đầu không có sự kiện', () => {
  expect(diffEvents(null, gh(makePr()), bl(), members, ctx).events).toEqual([]);
});

test('PR mới + comment mới → pr_opened, gh_comment với from/to đúng', () => {
  const first = diffEvents(null, gh(), bl(), members, { ...ctx, now: new Date('2026-11-21T04:00:00Z') });
  const pr = makePr({
    number: 8,
    author: 'user-a',
    createdAt: '2026-11-21T04:30:00Z',
    comments: [makeComment({ author: 'user-b', body: 'ok @user-a 🤖 Generated with Claude Code', createdAt: '2026-11-21T04:40:00Z' })],
  });
  const { events } = diffEvents(first.seen, gh(pr), bl(), members, ctx);
  expect(events.map((e) => e.type).sort()).toEqual(['gh_comment', 'pr_opened']);
  expect(events.find((e) => e.type === 'gh_comment')).toMatchObject({ from: 'b', to: ['a'], viaAgent: true });
  expect(events.find((e) => e.type === 'pr_opened')).toMatchObject({ from: 'a', to: ['a'] });
});

test('PR chuyển open → merged sinh pr_merged; review mới và yêu cầu review mới', () => {
  const pr = makePr({ number: 9, author: 'user-a' });
  const s1 = diffEvents(null, gh(pr), bl(), members, ctx).seen;
  const pr2 = {
    ...pr,
    requestedReviewers: ['user-b'],
    reviews: [makeReview({ author: 'user-b', state: 'APPROVED', submittedAt: '2026-11-21T04:50:00Z' })],
  };
  const e2 = diffEvents(s1, gh(pr2), bl(), members, ctx);
  expect(e2.events.map((e) => e.type).sort()).toEqual(['review', 'review_requested']);
  const merged = { ...pr2, state: 'merged' as const, closedAt: '2026-11-21T04:55:00Z' };
  expect(diffEvents(e2.seen, gh(merged), bl(), members, ctx).events.map((e) => e.type)).toEqual(['pr_merged']);
});

test('comment Backlog mới và task đổi trạng thái', () => {
  const t = makeTask({ number: 5, assigneeId: 3, status: 'Chưa xử lý', bucket: 'todo' });
  const s1 = diffEvents(null, gh(), bl({ tasks: [t] }), members, ctx).seen;
  const t2 = { ...t, status: 'Đang xử lý', bucket: 'doing' as const, updatedAt: '2026-11-21T04:50:00Z' };
  const cm = makeBacklogComment({ taskNumber: 5, authorId: 1, notifiedIds: [3], createdAt: '2026-11-21T04:51:00Z' });
  const { events } = diffEvents(s1, gh(), bl({ tasks: [t2], comments: [cm] }), members, ctx);
  expect(events.find((e) => e.type === 'task_status')).toMatchObject({ to: ['c'] });
  expect(events.find((e) => e.type === 'backlog_comment')).toMatchObject({ from: 'a', to: ['c'] });
});

test('dữ liệu cũ lộ ra do backfill không bắn sự kiện', () => {
  const s1 = diffEvents(null, gh(), bl(), members, ctx).seen;
  const old = makePr({ createdAt: '2026-11-10T00:00:00Z' });
  expect(diffEvents(s1, gh(old), bl(), members, ctx).events).toEqual([]);
});

test('chạy lại cùng dữ liệu không sinh sự kiện mới (idempotent)', () => {
  const s0 = diffEvents(null, gh(), bl(), members, { ...ctx, now: new Date('2026-11-21T04:00:00Z') }).seen;
  const data = gh(makePr({ createdAt: '2026-11-21T04:30:00Z', comments: [makeComment({ createdAt: '2026-11-21T04:31:00Z' })] }));
  const r1 = diffEvents(s0, data, bl(), members, ctx);
  expect(r1.events.length).toBeGreaterThan(0);
  expect(diffEvents(r1.seen, data, bl(), members, ctx).events).toEqual([]);
});

test('mergeEvents giữ 50 mới nhất, bỏ trùng id', () => {
  const ev = (i: number): OfficeEvent => ({ id: `e${i}`, type: 'gh_comment', at: new Date(Date.UTC(2026, 10, 1, 0, i)).toISOString(), from: null, to: [], title: '', url: '' });
  const merged = mergeEvents(Array.from({ length: 40 }, (_, i) => ev(i)), Array.from({ length: 20 }, (_, i) => ev(i + 30)));
  expect(merged).toHaveLength(50);
  expect(new Set(merged.map((e) => e.id)).size).toBe(50);
  expect(merged[0]!.id).toBe('e49');
});

test('writeStore rồi readStore trả đúng dữ liệu; chưa có file → null', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'office-'));
  expect(await readStore(dir)).toBeNull();
  const snapshot = { ...buildSnapshot(gh(), bl(), members, ctx), events: [], staleSources: [] };
  const { seen } = diffEvents(null, gh(), bl(), members, ctx);
  await writeStore(dir, { snapshot, seen });
  expect(await readStore(dir)).toEqual({ snapshot, seen });
});
