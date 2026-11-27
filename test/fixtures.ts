// Dữ liệu bịa cho test — không dùng dữ liệu thật (repo public).
import type { BacklogComment, Member, PrComment, PullRequest, Review, Task } from '../src/shared/types.js';

let seq = 1000;
const next = () => ++seq;

export function makeMember(p: Partial<Member> = {}): Member {
  const id = next();
  return { key: `m${id}`, display: `Người ${id}`, backlogUserId: id, github: [], role: 'dev', ...p };
}

export function makeTask(p: Partial<Task> = {}): Task {
  const n = p.number ?? next();
  return {
    number: n,
    key: `DEMO-${n}`,
    title: `Task ${n}`,
    assigneeId: null,
    status: 'Đang xử lý',
    bucket: 'doing',
    milestoneIds: [],
    updatedAt: '2026-11-20T00:00:00Z',
    url: `https://demo.backlog.com/view/DEMO-${n}`,
    ...p,
  };
}

export function makeReview(p: Partial<Review> = {}): Review {
  return { id: next(), author: 'user-r', state: 'COMMENTED', submittedAt: '2026-11-20T01:00:00Z', body: '', ...p };
}

export function makeComment(p: Partial<PrComment> = {}): PrComment {
  const id = next();
  return { id, author: 'user-c', body: '', createdAt: '2026-11-20T01:00:00Z', url: `https://github.com/o/r/pull/1#c${id}`, ...p };
}

export function makePr(p: Partial<PullRequest> = {}): PullRequest {
  const n = p.number ?? next();
  return {
    repo: 'o/r',
    number: n,
    title: `feat: pr ${n}`,
    branch: `feat/x-${n}`,
    body: '',
    author: 'user-a',
    draft: false,
    state: 'open',
    createdAt: '2026-11-20T00:00:00Z',
    closedAt: null,
    requestedReviewers: [],
    requestedTeams: [],
    reviews: [],
    comments: [],
    url: `https://github.com/o/r/pull/${n}`,
    ...p,
  };
}

export function makeBacklogComment(p: Partial<BacklogComment> = {}): BacklogComment {
  const id = next();
  return {
    id,
    taskNumber: 1,
    authorId: 1,
    notifiedIds: [],
    createdAt: '2026-11-20T01:00:00Z',
    body: '',
    url: `https://demo.backlog.com/view/DEMO-1#comment-${id}`,
    ...p,
  };
}
