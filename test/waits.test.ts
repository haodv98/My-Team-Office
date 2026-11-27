import { expect, test } from 'vitest';
import type { BacklogData, GithubData, PullRequest } from '../src/shared/types.js';
import { businessDaysBetween, computeWaits } from '../src/server/waits.js';
import { makeBacklogComment, makeComment, makeMember, makePr, makeReview, makeTask } from './fixtures.js';

const a = makeMember({ key: 'a', github: ['user-a'], backlogUserId: 1 });
const b = makeMember({ key: 'b', github: ['user-b'], backlogUserId: 2 });
const c = makeMember({ key: 'c', github: [], backlogUserId: 3 });
const members = [a, b, c];
const ctx = { projectKey: 'DEMO', agentMarkers: ['Generated with Claude Code'], now: new Date('2026-11-21T05:00:00Z') };
const AGENT = '\n🤖 Generated with Claude Code';

const emptyBl: BacklogData = { users: [], milestones: [], tasks: [], comments: [] };
const gh = (...pulls: PullRequest[]): GithubData => ({ pulls });
const run = (g: GithubData, bl: BacklogData = emptyBl) => computeWaits(g, bl, members, ctx);
const kinds = (r: ReturnType<typeof run>) => r.waits.map((w) => `${w.kind}:${w.recipient}`).sort();

test('reviewer được yêu cầu → mục review', () => {
  const r = run(gh(makePr({ number: 1, author: 'user-a', requestedReviewers: ['User-B'] })));
  expect(kinds(r)).toEqual(['review:b']);
  expect(r.waits[0]).toMatchObject({ id: 'review:o/r#1:b', sender: { memberKey: 'a' }, stale: false });
});

test('CHANGES_REQUESTED, chủ PR có commit mới nhưng chưa yêu cầu lại → vẫn mục fix cho chủ PR', () => {
  const pr = makePr({ author: 'user-a', reviews: [makeReview({ author: 'user-b', state: 'CHANGES_REQUESTED' })] });
  expect(kinds(run(gh(pr)))).toEqual(['fix:a']);
});

test('COMMENTED sau CHANGES_REQUESTED không xoá yêu cầu sửa', () => {
  const pr = makePr({
    author: 'user-a',
    reviews: [
      makeReview({ author: 'user-b', state: 'CHANGES_REQUESTED', submittedAt: '2026-11-20T01:00:00Z' }),
      makeReview({ author: 'user-b', state: 'COMMENTED', submittedAt: '2026-11-20T02:00:00Z' }),
    ],
  });
  expect(kinds(run(gh(pr)))).toEqual(['fix:a']);
});

test('CHANGES_REQUESTED rồi được yêu cầu review lại → chỉ mục review cho reviewer, không mục fix', () => {
  const pr = makePr({
    author: 'user-a',
    requestedReviewers: ['user-b'],
    reviews: [makeReview({ author: 'user-b', state: 'CHANGES_REQUESTED' })],
  });
  expect(kinds(run(gh(pr)))).toEqual(['review:b']);
});

test('CHANGES_REQUESTED rồi APPROVED → không mục nào', () => {
  const pr = makePr({
    author: 'user-a',
    reviews: [
      makeReview({ author: 'user-b', state: 'CHANGES_REQUESTED', submittedAt: '2026-11-20T01:00:00Z' }),
      makeReview({ author: 'user-b', state: 'APPROVED', submittedAt: '2026-11-20T03:00:00Z' }),
    ],
  });
  expect(kinds(run(gh(pr)))).toEqual([]);
});

test('PR agent mở dưới tài khoản chung, task giao cho c → mục fix đến c', () => {
  const pr = makePr({
    author: 'user-a',
    branch: 'feat/612-x',
    reviews: [makeReview({ author: 'user-b', state: 'CHANGES_REQUESTED' })],
  });
  const bl = { ...emptyBl, tasks: [makeTask({ number: 612, assigneeId: 3 })] };
  expect(kinds(run(gh(pr), bl))).toEqual(['fix:c']);
});

test('@user-b trong comment → mục gh_mention cho b', () => {
  const pr = makePr({ author: 'user-a', comments: [makeComment({ author: 'user-a', body: 'nhờ @user-b xem' })] });
  expect(kinds(run(gh(pr)))).toEqual(['gh_mention:b']);
});

test('@user-b rồi b trả lời qua agent (có dấu) → tắt mục gh_mention', () => {
  const pr = makePr({
    author: 'user-a',
    comments: [
      makeComment({ author: 'user-a', body: 'nhờ @user-b xem', createdAt: '2026-11-20T01:00:00Z' }),
      makeComment({ author: 'user-b', body: `đã sửa${AGENT}`, createdAt: '2026-11-20T02:00:00Z' }),
    ],
  });
  expect(kinds(run(gh(pr)))).toEqual([]);
});

test('sender là agent → viaAgent', () => {
  const pr = makePr({ author: 'user-a', comments: [makeComment({ author: 'user-a', body: `@user-b xem${AGENT}` })] });
  expect(run(gh(pr)).waits[0]!.sender).toEqual({ memberKey: 'a', login: 'user-a', viaAgent: true });
});

test('tự nhắc chính mình không tạo mục', () => {
  const pr = makePr({ author: 'user-a', comments: [makeComment({ author: 'user-a', body: 'ghi chú @user-a' })] });
  expect(kinds(run(gh(pr)))).toEqual([]);
});

test('PR đã đóng không tạo mục', () => {
  expect(kinds(run(gh(makePr({ state: 'merged', requestedReviewers: ['user-b'] }))))).toEqual([]);
});

test('Backlog notify c → mục; c comment sau → tắt; task đóng → tắt', () => {
  const t = makeTask({ number: 5, assigneeId: 1 });
  const notify = makeBacklogComment({ taskNumber: 5, authorId: 1, notifiedIds: [3], createdAt: '2026-11-20T01:00:00Z' });
  expect(kinds(run(gh(), { ...emptyBl, tasks: [t], comments: [notify] }))).toEqual(['backlog_notify:c']);

  const reply = makeBacklogComment({ taskNumber: 5, authorId: 3, createdAt: '2026-11-20T02:00:00Z' });
  expect(kinds(run(gh(), { ...emptyBl, tasks: [t], comments: [notify, reply] }))).toEqual([]);

  const closed = { ...t, bucket: 'closed' as const };
  expect(kinds(run(gh(), { ...emptyBl, tasks: [closed], comments: [notify] }))).toEqual([]);
});

test('Backlog notify người chưa có trong members.yaml → recipient bl-<id>', () => {
  const t = makeTask({ number: 5 });
  const notify = makeBacklogComment({ taskNumber: 5, authorId: 1, notifiedIds: [99] });
  expect(kinds(run(gh(), { ...emptyBl, tasks: [t], comments: [notify] }))).toEqual(['backlog_notify:bl-99']);
});

test('team được yêu cầu review → teamWaits, không WaitItem', () => {
  const r = run(gh(makePr({ number: 7, requestedTeams: ['qa'] })));
  expect(r.waits).toEqual([]);
  expect(r.teamWaits).toEqual([{ team: 'qa', pr: expect.objectContaining({ number: 7 }) }]);
});

test('mục chờ quá 3 ngày làm việc → stale', () => {
  const pr = makePr({ author: 'user-a', createdAt: '2026-11-13T02:00:00Z', requestedReviewers: ['user-b'] });
  expect(run(gh(pr)).waits[0]!.stale).toBe(true);
});

test('stale: T6 9h → T4 tuần sau 10h là 3 ngày làm việc; T5 là 4', () => {
  expect(businessDaysBetween(new Date('2026-11-20T02:00:00Z'), new Date('2026-11-25T03:00:00Z'))).toBe(3);
  expect(businessDaysBetween(new Date('2026-11-20T02:00:00Z'), new Date('2026-11-26T03:00:00Z'))).toBe(4);
  expect(businessDaysBetween(new Date('2026-11-20T02:00:00Z'), new Date('2026-11-20T08:00:00Z'))).toBe(0);
});
