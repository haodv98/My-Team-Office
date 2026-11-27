// Sinh data/state.json dữ liệu bịa để xem giao diện khi chưa có token.
// Chạy: npx tsx scripts/demo-state.ts  (rồi chạy server với env bất kỳ — nguồn lỗi sẽ giữ bản này)
import type { BacklogData, GithubData, Member } from '../src/shared/types.js';
import { buildSnapshot, diffEvents, mergeEvents, writeStore } from '../src/server/snapshot.js';

const now = new Date();
const iso = (minAgo: number) => new Date(now.getTime() - minAgo * 60_000).toISOString();
const names = ['An', 'Bình', 'Chi', 'Dũng', 'Giang', 'Hà', 'Khoa', 'Lan', 'Minh', 'Nga', 'Phúc', 'Quân'];
const roles = ['dev', 'dev', 'dev', 'dev', 'dev', 'qs', 'qs', 'qs', 'ba', 'ba', 'lead', 'lead'];
const members: Member[] = names.map((n, i) => ({
  key: `m${i + 1}`,
  display: `Người ${n}`,
  backlogUserId: 100 + i,
  github: i < 5 ? [`user-${i + 1}`] : [],
  role: roles[i]!,
}));

const bl: BacklogData = {
  users: members.map((m) => ({ id: m.backlogUserId, name: m.display })),
  milestones: [{ id: 1, name: 'Đợt 3', start: iso(60 * 24 * 3), due: new Date(now.getTime() + 4 * 864e5).toISOString() }],
  tasks: Array.from({ length: 24 }, (_, i) => ({
    number: 600 + i,
    key: `DEMO-${600 + i}`,
    title: ['Bảng khối lượng', 'Xuất file bàn giao', 'Kiểm hồ sơ đầu vào', 'Danh mục không gian'][i % 4]!,
    assigneeId: 100 + (i % 12),
    status: ['Đang xử lý', 'Chưa xử lý', 'Đã xử lý', 'Đóng'][i % 4]!,
    bucket: (['doing', 'todo', 'done', 'closed'] as const)[i % 4]!,
    milestoneIds: [1],
    updatedAt: iso(i * 30),
    url: `https://demo.backlog.com/view/DEMO-${600 + i}`,
  })),
  comments: [
    { id: 1, taskNumber: 600, authorId: 105, notifiedIds: [100], createdAt: iso(90), body: 'Nhờ xem lại', url: 'https://demo.backlog.com/view/DEMO-600#comment-1' },
    { id: 2, taskNumber: 604, authorId: 106, notifiedIds: [101, 102], createdAt: iso(60 * 24 * 6), body: 'Xác nhận số', url: 'https://demo.backlog.com/view/DEMO-604#comment-2' },
  ],
};

const gh: GithubData = {
  pulls: [
    { n: 901, branch: 'feat/600-bang', author: 'user-1', req: ['user-2'] },
    { n: 902, branch: 'feat/604-xuat', author: 'user-1', req: [] },
    { n: 903, branch: 'fix/khac', author: 'user-3', req: ['user-1'] },
  ].map((p, i) => ({
    repo: 'demo/repo',
    number: p.n,
    title: `feat: PR mẫu ${p.n}`,
    branch: p.branch,
    body: '',
    author: p.author,
    draft: i === 2,
    state: 'open' as const,
    createdAt: iso(200 - i * 50),
    closedAt: null,
    requestedReviewers: p.req,
    requestedTeams: i === 1 ? ['qa'] : [],
    reviews:
      i === 1 ? [{ id: 50, author: 'user-2', state: 'CHANGES_REQUESTED' as const, submittedAt: iso(40), body: 'Sửa giúp\n🤖 Generated with Claude Code' }] : [],
    comments: i === 0 ? [{ id: 70, author: 'user-2', body: '@user-4 xem giúp', createdAt: iso(20), url: `https://github.com/demo/repo/pull/${p.n}` }] : [],
    url: `https://github.com/demo/repo/pull/${p.n}`,
  })),
};

const ctx = { projectKey: 'DEMO', agentMarkers: ['Generated with Claude Code'], now };
const prevSeen = diffEvents(null, { pulls: [] }, { ...bl, comments: [], tasks: [] }, members, { ...ctx, now: new Date(now.getTime() - 300 * 60_000) }).seen;
const { events, seen } = diffEvents(prevSeen, gh, bl, members, ctx);
const snapshot = { ...buildSnapshot(gh, bl, members, ctx), events: mergeEvents([], events), staleSources: [] };
await writeStore(process.env.DATA_DIR ?? 'data', { snapshot, seen });
console.log(`Đã ghi state.json: ${snapshot.desks.length} bàn, ${events.length} sự kiện.`);
