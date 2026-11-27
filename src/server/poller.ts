// Vòng polling: thu thập → dựng snapshot → sinh sự kiện → lưu.
import type { BacklogComment, BacklogData, GithubData, Member, OfficeEvent, Snapshot } from '../shared/types.js';
import { collectBacklog } from './backlog.js';
import { type Config, safeLoadMembers } from './config.js';
import { collectGithub } from './github.js';
import { CachedFetcher, SourceError } from './http.js';
import { buildSnapshot, diffEvents, mergeEvents, readStore, type StoredState, writeStore } from './snapshot.js';

const DAY_MS = 864e5;
const BACKFILL_DAYS = 14;
const STALE_SNAPSHOT_MS = 3600_000;

export interface CycleDeps {
  collectGithub: (since: Date) => Promise<GithubData>;
  collectBacklog: (since: Date) => Promise<BacklogData>;
  members: Member[];
  ctx: { projectKey: string; agentMarkers: string[] };
  now: () => Date;
  prev: StoredState | null;
}

export async function runCycle(deps: CycleDeps): Promise<{ state: StoredState; fresh: OfficeEvent[] }> {
  const now = deps.now();
  const prev = deps.prev;
  const backfill = !prev || now.getTime() - new Date(prev.snapshot.generatedAt).getTime() > STALE_SNAPSHOT_MS;
  const since = new Date(now.getTime() - (backfill ? BACKFILL_DAYS : 1) * DAY_MS);

  const [g, b] = await Promise.allSettled([deps.collectGithub(since), deps.collectBacklog(since)]);
  if (g.status === 'rejected' || b.status === 'rejected') {
    const failed: ('github' | 'backlog')[] = [];
    if (g.status === 'rejected') failed.push('github');
    if (b.status === 'rejected') failed.push('backlog');
    const reason = g.status === 'rejected' ? g.reason : (b as PromiseRejectedResult).reason;
    if (!prev) throw reason;
    console.warn(JSON.stringify({ level: 'warn', msg: 'Nguồn dữ liệu lỗi, giữ snapshot cũ', failed, error: String(reason) }));
    return { state: { ...prev, snapshot: { ...prev.snapshot, staleSources: failed } }, fresh: [] };
  }

  const bl: BacklogData = { ...b.value, comments: carryComments(prev?.blComments ?? [], b.value, now) };
  const ctx = { ...deps.ctx, now };
  const { events, seen } = diffEvents(prev?.seen ?? null, g.value, bl, deps.members, ctx);
  const base = buildSnapshot(g.value, bl, deps.members, { ...ctx, requestedSince: seen.requestedAt ?? {} });
  const snapshot: Snapshot = { ...base, events: mergeEvents(prev?.snapshot.events ?? [], events), staleSources: [] };
  return { state: { snapshot, seen, blComments: bl.comments }, fresh: events };
}

/** Gộp comment Backlog cũ còn hiệu lực (task còn mở, trong 14 ngày) với comment vừa đọc. */
function carryComments(prev: BacklogComment[], fresh: BacklogData, now: Date): BacklogComment[] {
  const open = new Set(fresh.tasks.filter((t) => t.bucket !== 'closed').map((t) => t.number));
  const cutoff = now.getTime() - BACKFILL_DAYS * DAY_MS;
  const byId = new Map<number, BacklogComment>();
  for (const c of [...prev, ...fresh.comments]) {
    if (open.has(c.taskNumber) && new Date(c.createdAt).getTime() >= cutoff) byId.set(c.id, c);
  }
  return [...byId.values()].sort((x, y) => x.createdAt.localeCompare(y.createdAt));
}

export function startPoller(
  cfg: Config,
  onUpdate: (s: Snapshot, fresh: OfficeEvent[]) => void,
): { stop(): void; current(): Snapshot | null; ready: Promise<void> } {
  const f = new CachedFetcher(cfg.proxy ? { proxy: cfg.proxy } : {});
  let state: StoredState | null = null;
  let members: Member[] = [];
  let timer: NodeJS.Timeout | undefined;
  let stopped = false;

  const tick = async () => {
    try {
      const { state: next, fresh } = await runCycle({
        collectGithub: (since) => collectGithub(f, cfg.github, since),
        collectBacklog: (since) => collectBacklog(f, cfg.backlog, cfg.statusMap, since),
        // Đọc lại mỗi chu kỳ để sửa members.yaml không cần khởi động lại.
        members: (members = safeLoadMembers(cfg.membersFile, members)),
        ctx: { projectKey: cfg.backlog.projectKey, agentMarkers: cfg.agentMarkers },
        now: () => new Date(),
        prev: state,
      });
      state = next;
      await writeStore(cfg.dataDir, next);
      onUpdate(next.snapshot, fresh);
    } catch (e) {
      const msg = e instanceof SourceError ? e.message : String(e);
      console.error(JSON.stringify({ level: 'error', msg: 'Chu kỳ polling lỗi, thử lại chu kỳ sau', error: msg }));
    } finally {
      if (!stopped) timer = setTimeout(tick, cfg.pollSeconds * 1000);
    }
  };

  const ready = (async () => {
    state = await readStore(cfg.dataDir);
    if (state) onUpdate(state.snapshot, []);
    void tick();
  })();

  return {
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
    },
    current: () => state?.snapshot ?? null,
    ready,
  };
}
