import { expect, test } from 'vitest';
import { computeProgress } from '../src/server/progress.js';
import { makeTask } from './fixtures.js';

const today = new Date('2026-11-27T05:00:00Z');
const m1 = { id: 1, name: 'Đợt A', start: '2026-11-27T00:00:00Z', due: '2026-12-03T00:00:00Z' };
const m2 = { id: 2, name: 'Đợt B', start: '2026-11-21T00:00:00Z', due: '2026-11-27T00:00:00Z' };
const old = { id: 3, name: 'Cũ', start: '2026-10-01T00:00:00Z', due: '2026-10-09T00:00:00Z' };

test('tiến độ: 2 milestone chồng nhau đều hiện, milestone cũ bị bỏ', () => {
  const tasks = [
    makeTask({ milestoneIds: [1], bucket: 'closed' }),
    makeTask({ milestoneIds: [1], bucket: 'doing' }),
    makeTask({ milestoneIds: [1], bucket: 'todo' }),
    makeTask({ milestoneIds: [2, 3], bucket: 'done' }),
  ];
  const p = computeProgress({ users: [], milestones: [m1, m2, old], tasks, comments: [] }, today);
  expect(p.map((x) => x.milestone.id)).toEqual([1, 2]);
  expect(p[0]).toMatchObject({ counts: { todo: 1, doing: 1, done: 0, closed: 1 }, percentClosed: 33, daysLeft: 6 });
  expect(p[1]).toMatchObject({ counts: { todo: 0, doing: 0, done: 1, closed: 0 }, percentClosed: 0, daysLeft: 0 });
});

test('milestone không có task → 0%', () => {
  expect(computeProgress({ users: [], milestones: [m1], tasks: [], comments: [] }, today)[0]!.percentClosed).toBe(0);
});
