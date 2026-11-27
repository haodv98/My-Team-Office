// Dựng Snapshot cho trình duyệt, sinh sự kiện mới, lưu trạng thái ra file.
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  BacklogData,
  Desk,
  DeskPr,
  GithubData,
  Member,
  OfficeEvent,
  PullRequest,
  Snapshot,
  Task,
  WaitItem,
} from '../shared/types.js';
import { memberByLogin } from './config.js';
import { attributePr, resolveActor, toDeskPr } from './match.js';
import { computeProgress } from './progress.js';
import { computeWaits, keyForBacklogUser, type WaitCtx } from './waits.js';

export interface Seen {
  at: string;
  prs: Record<string, PullRequest['state']>;
  reviewIds: number[];
  commentIds: number[];
  backlogCommentIds: number[];
  taskStatus: Record<number, string>;
  requested: string[];
  /** Lúc thấy lần đầu mỗi yêu cầu review (`{repo}#{n}:{login}`). */
  requestedAt?: Record<string, string>;
}

export interface StoredState {
  snapshot: Snapshot;
  seen: Seen;
  /** Comment Backlog mang theo qua các chu kỳ để mục chờ không mất khi ra khỏi cửa sổ đọc 24 giờ. */
  blComments?: BacklogData['comments'];
}

const MAX_EVENTS = 50;
/** Sự kiện cũ hơn lần quét trước quá mức này là dữ liệu cũ lộ ra do backfill, không bắn. */
const EVENT_WINDOW_MARGIN_MS = 10 * 60 * 1000;

/** Mọi người có bàn: members.yaml ∪ thành viên dự án Backlog. */
function people(members: Member[], bl: BacklogData): { all: Member[]; unmapped: string[] } {
  const icon = new Map(bl.users.map((u) => [u.id, u.iconUrl]));
  const all: Member[] = members.map((m) => {
    const url = icon.get(m.backlogUserId);
    return url ? { ...m, avatarUrl: url } : m;
  });
  const unmapped: string[] = [];
  for (const u of bl.users) {
    if (members.some((m) => m.backlogUserId === u.id)) continue;
    unmapped.push(u.name);
    all.push({ key: `bl-${u.id}`, display: u.name, backlogUserId: u.id, github: [], role: 'khac', ...(u.iconUrl ? { avatarUrl: u.iconUrl } : {}) });
  }
  all.sort((x, y) => x.role.localeCompare(y.role) || x.display.localeCompare(y.display, 'vi'));
  return { all, unmapped: unmapped.sort((x, y) => x.localeCompare(y, 'vi')) };
}

const byUpdatedDesc = (x: Task, y: Task) => y.updatedAt.localeCompare(x.updatedAt);

export function buildSnapshot(
  gh: GithubData,
  bl: BacklogData,
  members: Member[],
  ctx: WaitCtx,
): Omit<Snapshot, 'events' | 'staleSources'> {
  const { all, unmapped } = people(members, bl);
  const desks = new Map<string, Desk>(all.map((m) => [m.key, { member: m, doingTasks: [], otherTasks: [], prs: [], waits: [] }]));
  const unassigned: { prs: DeskPr[]; waits: WaitItem[] } = { prs: [], waits: [] };
  const tasks = new Map(bl.tasks.map((t) => [t.number, t]));

  for (const t of bl.tasks) {
    if (t.assigneeId == null || t.bucket === 'closed') continue;
    const d = desks.get(keyForBacklogUser(members, t.assigneeId));
    if (!d) continue;
    (t.bucket === 'doing' ? d.doingTasks : d.otherTasks).push(t);
  }
  for (const d of desks.values()) {
    d.doingTasks.sort(byUpdatedDesc);
    d.otherTasks.sort(byUpdatedDesc);
  }

  const logins = new Set<string>();
  for (const pr of gh.pulls.filter((p) => p.state === 'open')) {
    const { memberKeys, taskNumbers } = attributePr(pr, tasks, members, ctx.projectKey);
    const dp = toDeskPr(pr, taskNumbers);
    const targets = memberKeys.map((k) => desks.get(k)).filter((d): d is Desk => !!d);
    if (targets.length) for (const d of targets) d.prs.push(dp);
    else unassigned.prs.push(dp);
    for (const l of [pr.author, ...pr.requestedReviewers, ...pr.reviews.map((r) => r.author), ...pr.comments.map((c) => c.author)]) {
      logins.add(l);
    }
  }

  const { waits, teamWaits } = computeWaits(gh, bl, members, ctx);
  for (const w of waits) {
    const d = desks.get(w.recipient);
    if (d) d.waits.push(w);
    else unassigned.waits.push(w);
  }

  const unmappedLogins = [...new Set([...logins].filter((l) => !memberByLogin(members, l)).map((l) => l.toLowerCase()))].sort();

  return {
    version: 1,
    generatedAt: ctx.now.toISOString(),
    desks: [...desks.values()],
    unassigned,
    teamWaits,
    progress: computeProgress(bl, ctx.now),
    unmappedLogins,
    unmappedMembers: unmapped,
  };
}

export function diffEvents(
  prevSeen: Seen | null,
  gh: GithubData,
  bl: BacklogData,
  members: Member[],
  ctx: WaitCtx,
): { events: OfficeEvent[]; seen: Seen } {
  const seen: Seen = { at: ctx.now.toISOString(), prs: {}, reviewIds: [], commentIds: [], backlogCommentIds: [], taskStatus: {}, requested: [], requestedAt: {} };
  const events: OfficeEvent[] = [];
  const tasks = new Map(bl.tasks.map((t) => [t.number, t]));
  const key = (login: string) => memberByLogin(members, login)?.key ?? null;
  const prev = prevSeen;
  const windowStart = prev ? new Date(prev.at).getTime() - EVENT_WINDOW_MARGIN_MS : 0;
  const emit = (e: OfficeEvent) => {
    if (prev && new Date(e.at).getTime() >= windowStart) events.push(e);
  };
  const others = (keys: (string | null)[], except: string | null) =>
    [...new Set(keys.filter((k): k is string => !!k && k !== except))];

  for (const pr of gh.pulls) {
    const ref = `${pr.repo}#${pr.number}`;
    const owners = attributePr(pr, tasks, members, ctx.projectKey).memberKeys;
    const base = { title: pr.title, url: pr.url };
    seen.prs[ref] = pr.state;
    const was = prev?.prs[ref];
    if (was === undefined && pr.state === 'open') {
      emit({ id: `ev:open:${ref}`, type: 'pr_opened', at: pr.createdAt, from: key(pr.author), to: owners, ...base });
    } else if (was !== pr.state && pr.state !== 'open') {
      const type = pr.state === 'merged' ? 'pr_merged' : 'pr_closed';
      emit({ id: `ev:${pr.state}:${ref}`, type, at: pr.closedAt ?? ctx.now.toISOString(), from: key(pr.author), to: owners, ...base });
    }

    for (const login of pr.requestedReviewers) {
      const rq = `${ref}:${login.toLowerCase()}`;
      seen.requested.push(rq);
      const firstSeen = prev?.requestedAt?.[rq] ?? (prev ? seen.at : undefined);
      if (firstSeen) seen.requestedAt![rq] = firstSeen;
      if (prev && !prev.requested.includes(rq)) {
        emit({ id: `ev:rq:${rq}:${seen.at}`, type: 'review_requested', at: seen.at, from: key(pr.author), to: others([key(login)], null), ...base });
      }
    }
    for (const r of pr.reviews) {
      seen.reviewIds.push(r.id);
      if (prev?.reviewIds.includes(r.id)) continue;
      const actor = resolveActor(r.author, r.body, members, ctx.agentMarkers);
      emit({ id: `ev:review:${r.id}`, type: 'review', at: r.submittedAt, from: actor.memberKey, to: others(owners, actor.memberKey), viaAgent: actor.viaAgent, ...base });
    }
    for (const c of pr.comments) {
      seen.commentIds.push(c.id);
      if (prev?.commentIds.includes(c.id)) continue;
      const actor = resolveActor(c.author, c.body, members, ctx.agentMarkers);
      const mentioned = [...c.body.matchAll(/@([A-Za-z0-9-]+)/g)].map((m) => key(m[1]!));
      emit({
        id: `ev:comment:${c.id}`,
        type: 'gh_comment',
        at: c.createdAt,
        from: actor.memberKey,
        to: others([...mentioned, ...owners], actor.memberKey),
        viaAgent: actor.viaAgent,
        title: pr.title,
        url: c.url,
      });
    }
  }

  for (const c of bl.comments) {
    seen.backlogCommentIds.push(c.id);
    if (prev?.backlogCommentIds.includes(c.id)) continue;
    const t = tasks.get(c.taskNumber);
    const from = keyForBacklogUser(members, c.authorId);
    emit({
      id: `ev:blc:${c.id}`,
      type: 'backlog_comment',
      at: c.createdAt,
      from,
      to: others(c.notifiedIds.map((id) => keyForBacklogUser(members, id)), from),
      title: t ? `${t.key} ${t.title}` : `#${c.taskNumber}`,
      url: c.url,
    });
  }

  for (const t of bl.tasks) {
    seen.taskStatus[t.number] = t.status;
    const was = prev?.taskStatus[t.number];
    if (was === undefined || was === t.status) continue;
    emit({
      id: `ev:status:${t.number}:${t.status}:${t.updatedAt}`,
      type: 'task_status',
      at: t.updatedAt,
      from: null,
      to: t.assigneeId == null ? [] : [keyForBacklogUser(members, t.assigneeId)],
      title: `${t.key} ${t.title} → ${t.status}`,
      url: t.url,
    });
  }

  events.sort((x, y) => x.at.localeCompare(y.at));
  return { events, seen };
}

export function mergeEvents(prev: OfficeEvent[], fresh: OfficeEvent[]): OfficeEvent[] {
  const byId = new Map<string, OfficeEvent>();
  for (const e of [...prev, ...fresh]) byId.set(e.id, e);
  return [...byId.values()].sort((x, y) => y.at.localeCompare(x.at)).slice(0, MAX_EVENTS);
}

const STATE_FILE = 'state.json';

export async function readStore(dataDir: string): Promise<StoredState | null> {
  try {
    return JSON.parse(await readFile(join(dataDir, STATE_FILE), 'utf8')) as StoredState;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    console.warn(JSON.stringify({ level: 'warn', msg: 'Không đọc được state.json, bắt đầu lại', error: String(e) }));
    return null;
  }
}

export async function writeStore(dataDir: string, s: StoredState): Promise<void> {
  await mkdir(dataDir, { recursive: true });
  const tmp = join(dataDir, `${STATE_FILE}.${process.pid}.tmp`);
  await writeFile(tmp, JSON.stringify(s), 'utf8');
  await rename(tmp, join(dataDir, STATE_FILE));
}
