// Thu thập thành viên, milestone, task, comment từ Backlog (chỉ đọc).
import type { BacklogComment, BacklogData, Milestone, ProgressBucket, Task } from '../shared/types.js';
import type { Config } from './config.js';
import type { CachedFetcher } from './http.js';

interface BlIssue {
  id: number;
  issueKey: string;
  keyId: number;
  summary: string;
  assignee: { id: number } | null;
  status: { id: number; name: string };
  milestone?: { id: number }[];
  updated: string;
}
interface BlComment {
  id: number;
  content: string | null;
  createdUser: { id: number } | null;
  created: string;
  notifications?: { user: { id: number } }[];
}

const DEFAULT_BUCKETS: Record<string, ProgressBucket> = {
  open: 'todo',
  未対応: 'todo',
  'chưa xử lý': 'todo',
  'in progress': 'doing',
  処理中: 'doing',
  'đang xử lý': 'doing',
  resolved: 'done',
  処理済み: 'done',
  'đã xử lý': 'done',
  closed: 'closed',
  完了: 'closed',
  đóng: 'closed',
};

const warned = new Set<string>();

export function bucketOf(status: string, statusMap: Record<string, ProgressBucket>): ProgressBucket {
  const mapped = statusMap[status] ?? DEFAULT_BUCKETS[status.trim().toLowerCase()];
  if (mapped) return mapped;
  if (!warned.has(status)) {
    warned.add(status);
    console.warn(JSON.stringify({ level: 'warn', msg: 'Trạng thái Backlog chưa ghép nhóm tiến độ, tạm tính todo', status }));
  }
  return 'todo';
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);

export async function collectBacklog(
  f: CachedFetcher,
  cfg: Config['backlog'],
  statusMap: Config['statusMap'],
  since: Date,
  now: Date = new Date(),
): Promise<BacklogData> {
  const api = `https://${cfg.space}/api/v2`;
  const q = (path: string, params: [string, string | number][] = []) => {
    const sp = new URLSearchParams([['apiKey', cfg.apiKey], ...params.map(([k, v]) => [k, String(v)] as [string, string])]);
    return `${api}${path}?${sp.toString()}`;
  };
  const key = encodeURIComponent(cfg.projectKey);

  const project = await f.getJson<{ id: number }>(q(`/projects/${key}`));
  const [rawUsers, rawVersions, statuses] = await Promise.all([
    f.getJson<{ id: number; name: string; nulabAccount?: { iconUrl?: string } | null }[]>(q(`/projects/${key}/users`)),
    f.getJson<{ id: number; name: string; startDate: string | null; releaseDueDate: string | null; archived: boolean }[]>(
      q(`/projects/${key}/versions`),
    ),
    f.getJson<{ id: number; name: string }[]>(q(`/projects/${key}/statuses`)),
  ]);

  const users = rawUsers.map((u) => ({
    id: u.id,
    name: u.name,
    ...(u.nulabAccount?.iconUrl ? { iconUrl: u.nulabAccount.iconUrl } : {}),
  }));
  const milestones: Milestone[] = rawVersions
    .filter((v) => !v.archived && v.startDate && v.releaseDueDate)
    .map((v) => ({ id: v.id, name: v.name, start: v.startDate!, due: v.releaseDueDate! }));
  const running = milestones.filter((m) => new Date(m.start) <= now && now <= endOfDay(m.due));

  const openStatusIds = statuses.filter((s) => bucketOf(s.name, statusMap) !== 'closed').map((s) => s.id);

  const fetchIssues = async (filter: [string, string | number][]): Promise<BlIssue[]> => {
    const out: BlIssue[] = [];
    for (let offset = 0; ; offset += 100) {
      const page = await f.getJson<BlIssue[]>(
        q('/issues', [['projectId[]', project.id], ...filter, ['count', 100], ['offset', offset], ['sort', 'updated']]),
      );
      out.push(...page);
      if (page.length < 100) return out;
    }
  };

  const byId = new Map<number, BlIssue>();
  if (openStatusIds.length) {
    for (const i of await fetchIssues(openStatusIds.map((id) => ['statusId[]', id] as [string, number]))) byId.set(i.id, i);
  }
  if (running.length) {
    for (const i of await fetchIssues(running.map((m) => ['milestoneId[]', m.id] as [string, number]))) byId.set(i.id, i);
  }

  const tasks: Task[] = [...byId.values()].map((i) => ({
    number: i.keyId,
    key: i.issueKey,
    title: i.summary,
    assigneeId: i.assignee?.id ?? null,
    status: i.status.name,
    bucket: bucketOf(i.status.name, statusMap),
    milestoneIds: (i.milestone ?? []).map((m) => m.id),
    updatedAt: i.updated,
    url: `https://${cfg.space}/view/${i.issueKey}`,
  }));

  const comments: BacklogComment[] = [];
  for (const t of tasks) {
    if (t.bucket === 'closed' || new Date(t.updatedAt) < since) continue;
    const raw = await f.getJson<BlComment[]>(q(`/issues/${encodeURIComponent(t.key)}/comments`, [['count', 100], ['order', 'desc']]));
    for (const c of raw) {
      if (new Date(c.created) < since) continue;
      comments.push({
        id: c.id,
        taskNumber: t.number,
        authorId: c.createdUser?.id ?? 0,
        notifiedIds: (c.notifications ?? []).map((n) => n.user.id),
        createdAt: c.created,
        body: c.content ?? '',
        url: `${t.url}#comment-${c.id}`,
      });
    }
  }
  comments.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return { users, milestones, tasks, comments };
}

function endOfDay(iso: string): Date {
  const d = new Date(iso);
  d.setUTCHours(23, 59, 59, 999);
  return d;
}
