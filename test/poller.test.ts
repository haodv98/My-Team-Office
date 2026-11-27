import { expect, test } from 'vitest';
import type { BacklogData, GithubData } from '../src/shared/types.js';
import { SourceError } from '../src/server/http.js';
import { runCycle } from '../src/server/poller.js';
import { makeMember, makePr } from './fixtures.js';

const NOW = new Date('2026-11-21T05:00:00Z');
const DAY = 864e5;
const members = [makeMember({ key: 'a', github: ['user-a'], backlogUserId: 1 })];
const ctx = { projectKey: 'DEMO', agentMarkers: ['Generated with Claude Code'] };
const bl: BacklogData = { users: [{ id: 1, name: 'An' }], milestones: [], tasks: [], comments: [] };
const gh: GithubData = { pulls: [makePr({ author: 'user-a', requestedReviewers: ['user-a'], createdAt: '2026-11-21T04:59:00Z' })] };

function deps(over: Partial<Parameters<typeof runCycle>[0]> = {}) {
  const sinces: Date[] = [];
  return {
    sinces,
    d: {
      collectGithub: async (s: Date) => (sinces.push(s), gh),
      collectBacklog: async (s: Date) => (sinces.push(s), bl),
      members,
      ctx,
      now: () => NOW,
      prev: null,
      ...over,
    } as Parameters<typeof runCycle>[0],
  };
}

test('lần đầu backfill 14 ngày', async () => {
  const { d, sinces } = deps();
  await runCycle(d);
  expect(sinces).toEqual([new Date(NOW.getTime() - 14 * DAY), new Date(NOW.getTime() - 14 * DAY)]);
});

test('lần sau đọc 24 giờ', async () => {
  const first = await runCycle(deps().d);
  const { d, sinces } = deps({ prev: first.state, now: () => new Date(NOW.getTime() + 60_000) });
  await runCycle(d);
  expect(sinces[0]).toEqual(new Date(NOW.getTime() + 60_000 - DAY));
});

test('snapshot cũ hơn 1 giờ → backfill lại 14 ngày', async () => {
  const first = await runCycle(deps().d);
  const later = new Date(NOW.getTime() + 2 * 3600_000);
  const { d, sinces } = deps({ prev: first.state, now: () => later });
  await runCycle(d);
  expect(sinces[0]).toEqual(new Date(later.getTime() - 14 * DAY));
});

test('GitHub 403 giữa chừng → giữ snapshot cũ, staleSources=[github], không sự kiện', async () => {
  const first = await runCycle(deps().d);
  const { d } = deps({
    prev: first.state,
    collectGithub: async () => {
      throw new SourceError('github', 403, 'https://api.github.com/x');
    },
  });
  const r = await runCycle(d);
  expect(r.fresh).toEqual([]);
  expect(r.state.snapshot.staleSources).toEqual(['github']);
  expect(r.state.snapshot.desks).toEqual(first.state.snapshot.desks);
  expect(r.state.seen).toEqual(first.state.seen);
});

test('nguồn lỗi ngay lần đầu → ném lỗi (chưa có gì để giữ)', async () => {
  const { d } = deps({
    collectBacklog: async () => {
      throw new SourceError('backlog', 500, 'https://demo.backlog.com/api/v2/x');
    },
  });
  await expect(runCycle(d)).rejects.toBeInstanceOf(SourceError);
});

test('nguồn hồi phục → staleSources rỗng, có sự kiện tích luỹ', async () => {
  const first = await runCycle(deps().d);
  const failed = await runCycle(
    deps({
      prev: first.state,
      collectBacklog: async () => {
        throw new SourceError('backlog', 500, 'x');
      },
    }).d,
  );
  const ok = await runCycle(deps({ prev: failed.state, now: () => new Date(NOW.getTime() + 60_000) }).d);
  expect(ok.state.snapshot.staleSources).toEqual([]);
  expect(ok.state.snapshot.desks[0]!.waits).toHaveLength(1);
});
