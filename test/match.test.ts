import { expect, test } from 'vitest';
import { attributePr, extractTaskNumbers, resolveActor } from '../src/server/match.js';
import { makeMember, makePr, makeTask } from './fixtures.js';

test('mã đầy đủ thắng số trong nhánh', () => {
  expect(extractTaskNumbers(makePr({ title: 'feat: x DEMO-12', branch: 'feat/99-y' }), 'DEMO')).toEqual([12]);
});

test('mã đầy đủ trong mô tả cũng nhận', () => {
  expect(extractTaskNumbers(makePr({ title: 'feat: x', branch: 'x', body: 'Liên quan DEMO-7, DEMO-3' }), 'DEMO')).toEqual([3, 7]);
});

test('nhánh feat/584-585-... cho hai task', () => {
  expect(extractTaskNumbers(makePr({ title: 'feat: x', branch: 'feat/584-585-danh-muc' }), 'DEMO')).toEqual([584, 585]);
});

test('nhánh feat/612-so-tmdt cho một task', () => {
  expect(extractTaskNumbers(makePr({ title: 'feat: x', branch: 'feat/612-so-tmdt-view' }), 'DEMO')).toEqual([612]);
});

test('tiêu đề feat(#583): ... cho task 583', () => {
  expect(extractTaskNumbers(makePr({ title: 'feat(#583): kiểm', branch: 'x' }), 'DEMO')).toEqual([583]);
});

test('"sửa review PR #901" không phải task', () => {
  expect(
    extractTaskNumbers(makePr({ title: 'fix(work-items): sửa review PR #901', branch: 'fix/pr901-review' }), 'DEMO'),
  ).toEqual([]);
});

test('PR do tài khoản chung mở được gán cho người giao task', () => {
  const a = makeMember({ key: 'a', github: ['shared'], backlogUserId: 1 });
  const b = makeMember({ key: 'b', github: [], backlogUserId: 2 });
  const tasks = new Map([[612, makeTask({ number: 612, assigneeId: 2 })]]);
  expect(attributePr(makePr({ author: 'shared', branch: 'feat/612-x' }), tasks, [a, b], 'DEMO')).toEqual({
    memberKeys: ['b'],
    taskNumbers: [612],
  });
});

test('hai task hai người → cả hai bàn', () => {
  const a = makeMember({ key: 'a', backlogUserId: 1 });
  const b = makeMember({ key: 'b', backlogUserId: 2 });
  const tasks = new Map([
    [584, makeTask({ number: 584, assigneeId: 1 })],
    [585, makeTask({ number: 585, assigneeId: 2 })],
  ]);
  expect(attributePr(makePr({ branch: 'feat/584-585-x' }), tasks, [a, b], 'DEMO').memberKeys).toEqual(['a', 'b']);
});

test('số task không tồn tại → rơi về người mở PR', () => {
  const a = makeMember({ key: 'a', github: ['user-a'] });
  expect(attributePr(makePr({ author: 'user-a', branch: 'fix/901-x' }), new Map(), [a], 'DEMO')).toEqual({
    memberKeys: ['a'],
    taskNumbers: [],
  });
});

test('task không có người giao → rơi về người mở PR, vẫn giữ số task', () => {
  const a = makeMember({ key: 'a', github: ['user-a'] });
  const tasks = new Map([[5, makeTask({ number: 5, assigneeId: null })]]);
  expect(attributePr(makePr({ author: 'User-A', branch: 'feat/5-x' }), tasks, [a], 'DEMO')).toEqual({
    memberKeys: ['a'],
    taskNumbers: [5],
  });
});

test('login lạ, không task → không gán ai', () => {
  expect(attributePr(makePr({ author: 'ghost', branch: 'x' }), new Map(), [], 'DEMO').memberKeys).toEqual([]);
});

test('comment có dấu agent vẫn tính cho chủ tài khoản', () => {
  const a = makeMember({ key: 'a', github: ['user-a'] });
  expect(resolveActor('user-a', '...\n🤖 Generated with Claude Code', [a], ['Generated with Claude Code'])).toEqual({
    memberKey: 'a',
    login: 'user-a',
    viaAgent: true,
  });
});

test('comment thường không có dấu agent', () => {
  expect(resolveActor('ghost', 'ok', [], ['Generated with Claude Code'])).toEqual({
    memberKey: null,
    login: 'ghost',
    viaAgent: false,
  });
});
