import { expect, test } from 'vitest';
import type { Desk } from '../src/shared/types.js';
import { layoutDesks } from '../src/web/layout.js';
import { makeMember } from './fixtures.js';

const desk = (key: string, role: string, display = key, waits = 0): Desk => ({
  member: makeMember({ key, role, display }),
  doingTasks: [],
  otherTasks: [],
  prs: [],
  waits: Array.from({ length: waits }, (_, i) => ({
    id: `w${i}`,
    kind: 'review' as const,
    recipient: key,
    sender: { memberKey: null, login: 'x', viaAgent: false },
    since: '',
    stale: false,
    title: '',
    url: '',
  })),
});

const pos = (ds: Desk[]) => Object.fromEntries(layoutDesks(ds).map((p) => [p.key, [p.x, p.z]]));

test('cùng tập người cho cùng toạ độ dù mục chờ khác, thứ tự đầu vào khác', () => {
  const a = [desk('a', 'dev', 'An'), desk('b', 'dev', 'Bình', 2), desk('c', 'qs', 'Chi')];
  const b = [desk('c', 'qs', 'Chi', 5), desk('b', 'dev', 'Bình'), desk('a', 'dev', 'An', 1)];
  expect(pos(a)).toEqual(pos(b));
});

test('hai role → hai dãy cách nhau 4, bàn cách nhau 2.5', () => {
  const p = layoutDesks([desk('a', 'dev', 'An'), desk('b', 'dev', 'Bình'), desk('c', 'qs', 'Chi')]);
  const byKey = Object.fromEntries(p.map((x) => [x.key, x]));
  expect(byKey.a!.z).toBe(byKey.b!.z);
  expect(Math.abs(byKey.c!.z - byKey.a!.z)).toBe(4);
  expect(Math.abs(byKey.b!.x - byKey.a!.x)).toBe(2.5);
  expect(byKey.a!.group).toBe('dev');
});

test('thêm một người vào role A không đổi toạ độ role B', () => {
  const before = pos([desk('a', 'dev', 'An'), desk('c', 'qs', 'Chi'), desk('d', 'qs', 'Dung')]);
  const after = pos([desk('a', 'dev', 'An'), desk('a2', 'dev', 'Anh'), desk('c', 'qs', 'Chi'), desk('d', 'qs', 'Dung')]);
  expect(after.c).toEqual(before.c);
  expect(after.d).toEqual(before.d);
});
