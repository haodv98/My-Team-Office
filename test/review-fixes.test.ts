// Test tái hiện các lỗi từ review toàn nhánh.
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import type { BacklogData, GithubData, Snapshot } from '../src/shared/types.js';
import { safeLoadMembers } from '../src/server/config.js';
import { CachedFetcher } from '../src/server/http.js';
import { attributePr } from '../src/server/match.js';
import { runCycle } from '../src/server/poller.js';
import { computeWaits } from '../src/server/waits.js';
import { buildServer } from '../src/server/server.js';
import { connect } from '../src/web/api.js';
import { agentActiveKeys } from '../src/web/agents.js';
import { snapshotRev } from '../src/shared/rev.js';
import { makeBacklogComment, makeMember, makePr, makeReview, makeTask } from './fixtures.js';

const a = makeMember({ key: 'a', github: ['user-a'], backlogUserId: 1 });
const b = makeMember({ key: 'b', github: ['user-b'], backlogUserId: 2 });
const c = makeMember({ key: 'c', github: [], backlogUserId: 3 });
const members = [a, b, c];
const emptyBl: BacklogData = { users: [], milestones: [], tasks: [], comments: [] };
const ctx = { projectKey: 'DEMO', agentMarkers: ['Generated with Claude Code'] };

test('#1 mục chờ Backlog còn sau 24 giờ dù comment đã ra khỏi cửa sổ đọc', async () => {
  const t0 = new Date('2026-11-23T02:00:00Z');
  const task = makeTask({ number: 5, assigneeId: 1, bucket: 'doing' });
  const notify = makeBacklogComment({ taskNumber: 5, authorId: 1, notifiedIds: [3], createdAt: '2026-11-23T01:00:00Z' });
  const first = await runCycle({
    collectGithub: async () => ({ pulls: [] }),
    collectBacklog: async () => ({ ...emptyBl, tasks: [task], comments: [notify] }),
    members, ctx, now: () => t0, prev: null,
  });
  // 25 giờ sau: lần đọc 24 giờ không còn trả comment cũ
  const t1 = new Date(t0.getTime() + 25 * 3600_000);
  let prev = first.state;
  for (let m = 1; m <= 25 * 60; m += 30) {
    const r = await runCycle({
      collectGithub: async () => ({ pulls: [] }),
      collectBacklog: async () => ({ ...emptyBl, tasks: [task], comments: [] }),
      members, ctx, now: () => new Date(t0.getTime() + m * 60_000), prev,
    });
    prev = r.state;
  }
  const last = await runCycle({
    collectGithub: async () => ({ pulls: [] }),
    collectBacklog: async () => ({ ...emptyBl, tasks: [task], comments: [] }),
    members, ctx, now: () => t1, prev,
  });
  expect(last.state.snapshot.desks.find((d) => d.member.key === 'c')!.waits.map((w) => w.kind)).toEqual(['backlog_notify']);
});

test('#1 task đã đóng thì bỏ comment mang theo', async () => {
  const t0 = new Date('2026-11-23T02:00:00Z');
  const notify = makeBacklogComment({ taskNumber: 5, authorId: 1, notifiedIds: [3], createdAt: '2026-11-23T01:00:00Z' });
  const first = await runCycle({
    collectGithub: async () => ({ pulls: [] }),
    collectBacklog: async () => ({ ...emptyBl, tasks: [makeTask({ number: 5 })], comments: [notify] }),
    members, ctx, now: () => t0, prev: null,
  });
  const r = await runCycle({
    collectGithub: async () => ({ pulls: [] }),
    collectBacklog: async () => ({ ...emptyBl, tasks: [makeTask({ number: 5, bucket: 'closed' })], comments: [] }),
    members, ctx, now: () => new Date(t0.getTime() + 60_000), prev: first.state,
  });
  expect(r.state.blComments).toEqual([]);
});

test('#2 snapshotRev đổi khi chỉ staleSources đổi; client tải lại', async () => {
  const s = { generatedAt: 'g1', staleSources: [] } as unknown as Snapshot;
  expect(snapshotRev(s)).not.toBe(snapshotRev({ ...s, staleSources: ['github'] }));
  const { app, broadcast } = buildServer({ getSnapshot: () => null });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const port = (app.server.address() as { port: number }).port;
  const ctrl = new AbortController();
  const res = await fetch(`http://127.0.0.1:${port}/api/events`, { signal: ctrl.signal });
  const reader = res.body!.getReader();
  let text = '';
  while (!text.includes('hello')) text += new TextDecoder().decode((await reader.read()).value);
  broadcast({ ...s, staleSources: ['github'] } as Snapshot, []);
  while (!text.includes('event: snapshot')) text += new TextDecoder().decode((await reader.read()).value);
  expect(text).toContain(`"rev":"${snapshotRev({ ...s, staleSources: ['github'] })}"`);
  ctrl.abort();
  await app.close();
});

test('#2 client tải lại khi rev đổi dù generatedAt giữ nguyên', async () => {
  class ES {
    static last: ES;
    l: Record<string, ((e: { data: string }) => void)[]> = {};
    onerror = null;
    onopen = null;
    constructor() { ES.last = this; }
    addEventListener(t: string, f: (e: { data: string }) => void) { (this.l[t] ??= []).push(f); }
    emit(t: string, d: unknown) { for (const f of this.l[t] ?? []) f({ data: JSON.stringify(d) }); }
    close() {}
  }
  let stale: string[] = [];
  let fetches = 0;
  const fetchImpl = (async () => (fetches++, new Response(JSON.stringify({ generatedAt: 'g1', staleSources: stale }), { status: 200 }))) as unknown as typeof fetch;
  const got: Snapshot[] = [];
  connect({ onSnapshot: (s) => got.push(s), onEvent: () => {}, onStatus: () => {} }, { EventSource: ES as unknown as typeof EventSource, fetch: fetchImpl });
  await new Promise((r) => setTimeout(r, 0));
  stale = ['github'];
  ES.last.emit('snapshot', { generatedAt: 'g1', rev: 'g1|github' });
  await new Promise((r) => setTimeout(r, 0));
  expect(fetches).toBe(2);
  expect(got.at(-1)!.staleSources).toEqual(['github']);
});

test('#3 mọi request có tín hiệu huỷ (timeout)', async () => {
  let signal: AbortSignal | undefined;
  const f = new CachedFetcher({
    fetchImpl: (async (_u: string, init?: RequestInit) => ((signal = init?.signal ?? undefined), new Response('{}', { status: 200 }))) as unknown as typeof fetch,
  });
  await f.getJson('https://api.github.com/x');
  expect(signal).toBeInstanceOf(AbortSignal);
});

test('#4 mục review tính từ lúc người đó được yêu cầu, không từ lúc mở PR', () => {
  const pr = makePr({ number: 1, author: 'user-a', createdAt: '2026-11-10T02:00:00Z', requestedReviewers: ['user-b'] });
  const now = new Date('2026-11-21T05:00:00Z');
  const { waits } = computeWaits({ pulls: [pr] }, emptyBl, members, {
    ...ctx, now, requestedSince: { 'o/r#1:user-b': '2026-11-21T04:00:00Z' },
  });
  expect(waits[0]).toMatchObject({ since: '2026-11-21T04:00:00Z', stale: false });
});

test('#4 review COMMENTED của người khác không đặt lại đồng hồ chờ', () => {
  const pr = makePr({
    number: 1, author: 'user-a', createdAt: '2026-11-10T02:00:00Z', requestedReviewers: ['user-b'],
    reviews: [makeReview({ author: 'user-x', state: 'COMMENTED', submittedAt: '2026-11-21T04:00:00Z' })],
  });
  const { waits } = computeWaits({ pulls: [pr] }, emptyBl, members, { ...ctx, now: new Date('2026-11-21T05:00:00Z'), requestedSince: { 'o/r#1:user-b': '2026-11-12T02:00:00Z' } });
  expect(waits[0]!.since).toBe('2026-11-12T02:00:00Z');
});

test('#4 runCycle ghi lại lúc thấy yêu cầu review lần đầu', async () => {
  const pr = makePr({ number: 1, author: 'user-a', createdAt: '2026-11-10T02:00:00Z' });
  const t0 = new Date('2026-11-21T02:00:00Z');
  const first = await runCycle({ collectGithub: async () => ({ pulls: [pr] }), collectBacklog: async () => emptyBl, members, ctx, now: () => t0, prev: null });
  const t1 = new Date('2026-11-21T03:00:00Z');
  const r = await runCycle({
    collectGithub: async () => ({ pulls: [{ ...pr, requestedReviewers: ['User-B'] }] }),
    collectBacklog: async () => emptyBl, members, ctx, now: () => t1, prev: first.state,
  });
  expect(r.state.snapshot.desks.find((d) => d.member.key === 'b')!.waits[0]!.since).toBe(t1.toISOString());
});

test('#5 số nhánh không tồn tại → thử tiếp luật tiêu đề', () => {
  const tasks = new Map([[583, makeTask({ number: 583, assigneeId: 3 })]]);
  expect(attributePr(makePr({ author: 'user-a', branch: 'fix/901-review', title: 'fix(#583): sửa' }), tasks, members, 'DEMO')).toEqual({
    memberKeys: ['c'], taskNumbers: [583],
  });
});

test('#11 members.yaml lỗi → giữ danh sách cũ; github dạng chuỗi được nhận', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mem-'));
  const ok = join(dir, 'ok.yaml');
  writeFileSync(ok, '- key: x\n  display: X\n  backlog_user_id: 1\n  github: User-X\n');
  expect(safeLoadMembers(ok, [])[0]!.github).toEqual(['user-x']);
  const bad = join(dir, 'bad.yaml');
  writeFileSync(bad, '- key: [\n');
  expect(safeLoadMembers(bad, [a])).toEqual([a]);
  expect(safeLoadMembers(join(dir, 'missing.yaml'), [b])).toEqual([b]);
});

test('#12 PR không gán được ai vẫn có mục chờ sửa (vào Chưa rõ người)', () => {
  const pr = makePr({ author: 'ghost', reviews: [makeReview({ author: 'user-b', state: 'CHANGES_REQUESTED' })] });
  const { waits } = computeWaits({ pulls: [pr] } as GithubData, emptyBl, members, { ...ctx, now: new Date('2026-11-21T05:00:00Z') });
  expect(waits.map((w) => [w.kind, w.recipient])).toEqual([['fix', 'gh:ghost']]);
});

test('#13 robot ở bàn chủ tài khoản gửi (agent của X), không ở bàn người nhận', () => {
  const s = {
    desks: [
      { member: a, doingTasks: [], otherTasks: [], prs: [], waits: [{ id: '1', kind: 'gh_mention', recipient: 'a', sender: { memberKey: 'b', login: 'user-b', viaAgent: true }, since: '', stale: false, title: '', url: '' }] },
      { member: b, doingTasks: [], otherTasks: [], prs: [], waits: [] },
    ],
    events: [{ id: 'e', type: 'review', at: '2026-11-21T04:50:00Z', from: 'c', to: ['a'], title: '', url: '', viaAgent: true }],
  } as unknown as Snapshot;
  expect([...agentActiveKeys(s, new Date('2026-11-21T05:00:00Z'))].sort()).toEqual(['b', 'c']);
  expect([...agentActiveKeys(s, new Date('2026-11-21T08:00:00Z'))]).toEqual(['b']);
});
