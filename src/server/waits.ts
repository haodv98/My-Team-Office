// Mục "đang chờ ai" (thiết kế §5.4).
import type { Actor, BacklogData, GithubData, Member, PullRequest, Snapshot, Task, WaitItem } from '../shared/types.js';
import { vnDayNumber, vnTimeOfDay, vnWeekday } from '../shared/time.js';
import { memberByLogin } from './config.js';
import { attributePr, resolveActor, toDeskPr } from './match.js';

export interface WaitCtx {
  projectKey: string;
  agentMarkers: string[];
  now: Date;
}

const STALE_BUSINESS_DAYS = 3;
const MENTION_RE = /@([A-Za-z0-9-]+)/g;

/** Số ngày làm việc (T2–T6, giờ VN) trọn vẹn giữa hai thời điểm. */
export function businessDaysBetween(from: Date, to: Date): number {
  const d0 = vnDayNumber(from);
  const d1 = vnDayNumber(to);
  let n = 0;
  for (let d = d0 + 1; d <= d1; d++) {
    const wd = vnWeekday(d);
    if (wd !== 0 && wd !== 6) n++;
  }
  const lastIsWorkday = ![0, 6].includes(vnWeekday(d1));
  if (n > 0 && lastIsWorkday && vnTimeOfDay(to) < vnTimeOfDay(from)) n--;
  return n;
}

/** Khoá bàn của một người Backlog: theo members.yaml, không có thì bl-<id>. */
export const keyForBacklogUser = (members: Member[], id: number): string =>
  members.find((m) => m.backlogUserId === id)?.key ?? `bl-${id}`;

const latest = (a: string, b: string) => (a > b ? a : b);

export function computeWaits(
  gh: GithubData,
  bl: BacklogData,
  members: Member[],
  ctx: WaitCtx,
): { waits: WaitItem[]; teamWaits: Snapshot['teamWaits'] } {
  const waits: WaitItem[] = [];
  const teamWaits: Snapshot['teamWaits'] = [];
  const tasks = new Map<number, Task>(bl.tasks.map((t) => [t.number, t]));
  const push = (w: Omit<WaitItem, 'stale'>) =>
    waits.push({ ...w, stale: businessDaysBetween(new Date(w.since), ctx.now) > STALE_BUSINESS_DAYS });
  const actor = (login: string, body: string): Actor => resolveActor(login, body, members, ctx.agentMarkers);

  for (const pr of gh.pulls.filter((p) => p.state === 'open')) {
    const { memberKeys, taskNumbers } = attributePr(pr, tasks, members, ctx.projectKey);
    const prRef = `${pr.repo}#${pr.number}`;
    const requested = new Set(pr.requestedReviewers.map((l) => l.toLowerCase()));
    const lastReviewAt = pr.reviews.reduce((acc, r) => latest(acc, r.submittedAt), pr.createdAt);

    for (const login of pr.requestedReviewers) {
      const m = memberByLogin(members, login);
      if (!m) continue;
      push({
        id: `review:${prRef}:${m.key}`,
        kind: 'review',
        recipient: m.key,
        sender: actor(pr.author, pr.body),
        since: lastReviewAt,
        title: pr.title,
        url: pr.url,
      });
    }

    for (const [reviewer, review] of latestDecisiveReviews(pr)) {
      if (review.state !== 'CHANGES_REQUESTED' || requested.has(reviewer)) continue;
      for (const key of memberKeys) {
        push({
          id: `fix:${prRef}:${reviewer}:${key}`,
          kind: 'fix',
          recipient: key,
          sender: actor(review.author, review.body),
          since: review.submittedAt,
          title: pr.title,
          url: pr.url,
        });
      }
    }

    pushMentions(pr, prRef, members, actor, push);
    for (const team of pr.requestedTeams) teamWaits.push({ team, pr: toDeskPr(pr, taskNumbers) });
  }

  for (const c of bl.comments) {
    const task = tasks.get(c.taskNumber);
    if (!task || task.bucket === 'closed') continue;
    for (const uid of c.notifiedIds) {
      if (uid === c.authorId) continue;
      const replied = bl.comments.some((x) => x.taskNumber === c.taskNumber && x.authorId === uid && x.createdAt > c.createdAt);
      if (replied) continue;
      const recipient = keyForBacklogUser(members, uid);
      push({
        id: `bln:${c.taskNumber}:${c.id}:${recipient}`,
        kind: 'backlog_notify',
        recipient,
        sender: { memberKey: keyForBacklogUser(members, c.authorId), login: `backlog:${c.authorId}`, viaAgent: false },
        since: c.createdAt,
        title: `${task.key} ${task.title}`,
        url: c.url,
      });
    }
  }
  return { waits, teamWaits };
}

/** Review mang tính quyết định (bỏ COMMENTED) mới nhất của từng reviewer, khoá login chữ thường. */
function latestDecisiveReviews(pr: PullRequest) {
  const out = new Map<string, PullRequest['reviews'][number]>();
  for (const r of [...pr.reviews].sort((a, b) => a.submittedAt.localeCompare(b.submittedAt))) {
    if (r.state === 'COMMENTED') continue;
    out.set(r.author.toLowerCase(), r);
  }
  return out;
}

function pushMentions(
  pr: PullRequest,
  prRef: string,
  members: Member[],
  actor: (login: string, body: string) => Actor,
  push: (w: Omit<WaitItem, 'stale'>) => void,
) {
  const posts = [
    ...pr.comments.map((c) => ({ id: `c${c.id}`, author: c.author, body: c.body, at: c.createdAt, url: c.url })),
    ...pr.reviews.map((r) => ({ id: `r${r.id}`, author: r.author, body: r.body, at: r.submittedAt, url: pr.url })),
  ];
  const authorKey = (login: string) => memberByLogin(members, login)?.key;
  for (const p of posts) {
    const seen = new Set<string>();
    for (const m of p.body.matchAll(MENTION_RE)) {
      const target = memberByLogin(members, m[1]!);
      if (!target || seen.has(target.key) || target.key === authorKey(p.author)) continue;
      seen.add(target.key);
      const replied = posts.some((x) => authorKey(x.author) === target.key && x.at > p.at);
      if (replied) continue;
      push({
        id: `ghm:${prRef}:${p.id}:${target.key}`,
        kind: 'gh_mention',
        recipient: target.key,
        sender: actor(p.author, p.body),
        since: p.at,
        title: pr.title,
        url: p.url,
      });
    }
  }
}
