import { expect, test } from 'vitest';
import type { Member, WaitItem } from '../src/shared/types.js';
import { ago, waitLabel } from '../src/web/format.js';

const members = new Map<string, Member>([
  ['a', { key: 'a', display: 'An', backlogUserId: 1, github: ['user-a'], role: 'dev' }],
  ['b', { key: 'b', display: 'Bình', backlogUserId: 2, github: ['user-b'], role: 'dev' }],
]);
const w = (p: Partial<WaitItem>): WaitItem => ({
  id: 'x',
  kind: 'review',
  recipient: 'b',
  sender: { memberKey: 'a', login: 'user-a', viaAgent: false },
  since: '2026-11-20T00:00:00Z',
  stale: false,
  title: 'feat: x',
  url: 'https://github.com/o/r/pull/12',
  ...p,
});

test('waitLabel bốn loại', () => {
  expect(waitLabel(w({ kind: 'review' }), members)).toBe('Chờ Bình review PR #12');
  expect(waitLabel(w({ kind: 'fix', recipient: 'a', sender: { memberKey: 'b', login: 'user-b', viaAgent: false } }), members)).toBe(
    'Chờ An sửa theo review của Bình',
  );
  expect(waitLabel(w({ kind: 'gh_mention', url: 'https://github.com/o/r/pull/12#issuecomment-5' }), members)).toBe('An nhắc Bình trên PR #12');
  expect(
    waitLabel(w({ kind: 'backlog_notify', title: 'DEMO-7 Sửa bảng', url: 'https://demo.backlog.com/view/DEMO-7#comment-1' }), members),
  ).toBe('An báo Bình trên DEMO-7');
});

test('người gửi là agent → thêm (agent); người lạ → dùng login', () => {
  expect(waitLabel(w({ sender: { memberKey: 'a', login: 'user-a', viaAgent: true } }), members)).toBe('Chờ Bình review PR #12');
  expect(waitLabel(w({ kind: 'gh_mention', sender: { memberKey: 'a', login: 'user-a', viaAgent: true } }), members)).toBe(
    'An (agent) nhắc Bình trên PR #12',
  );
  expect(waitLabel(w({ kind: 'gh_mention', sender: { memberKey: null, login: 'ghost', viaAgent: false } }), members)).toBe(
    'ghost nhắc Bình trên PR #12',
  );
});

test('ago bốn mốc', () => {
  const now = new Date('2026-11-21T05:00:00Z');
  expect(ago('2026-11-21T04:59:30Z', now)).toBe('vừa xong');
  expect(ago('2026-11-21T04:45:00Z', now)).toBe('15 phút trước');
  expect(ago('2026-11-21T02:00:00Z', now)).toBe('3 giờ trước');
  expect(ago('2026-11-18T05:00:00Z', now)).toBe('3 ngày trước');
});
