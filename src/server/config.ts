import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import type { Member, ProgressBucket } from '../shared/types.js';

export interface Config {
  github: { token: string; repos: string[] };
  backlog: { space: string; apiKey: string; projectKey: string };
  pollSeconds: number;
  port: number;
  membersFile: string;
  dataDir: string;
  proxy?: string;
  agentMarkers: string[];
  statusMap: Record<string, ProgressBucket>;
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const v = env[name]?.trim();
  if (!v) throw new Error(`Thiếu biến môi trường: ${name}`);
  return v;
}

const splitList = (s: string, sep: string) =>
  s
    .split(sep)
    .map((x) => x.trim())
    .filter(Boolean);

export function loadConfig(env: NodeJS.ProcessEnv): Config {
  const proxy = env.HTTPS_PROXY?.trim() || env.https_proxy?.trim();
  return {
    github: { token: required(env, 'GITHUB_TOKEN'), repos: splitList(required(env, 'GITHUB_REPOS'), ',') },
    backlog: {
      space: required(env, 'BACKLOG_SPACE'),
      apiKey: required(env, 'BACKLOG_API_KEY'),
      projectKey: required(env, 'BACKLOG_PROJECT_KEY'),
    },
    pollSeconds: Number(env.POLL_SECONDS ?? 60) || 60,
    port: Number(env.PORT ?? 4800) || 4800,
    membersFile: env.MEMBERS_FILE?.trim() || 'config/members.yaml',
    dataDir: env.DATA_DIR?.trim() || 'data',
    ...(proxy ? { proxy } : {}),
    agentMarkers: splitList(env.AGENT_MARKERS ?? 'Generated with Claude Code', '|'),
    statusMap: env.STATUS_MAP ? (JSON.parse(env.STATUS_MAP) as Record<string, ProgressBucket>) : {},
  };
}

interface RawMember {
  key: string;
  display: string;
  backlog_user_id: number;
  github?: string[] | string;
  role?: string;
}

export function loadMembers(path: string): Member[] {
  const raw = (parse(readFileSync(path, 'utf8')) ?? []) as RawMember[];
  return raw.map((r) => ({
    key: String(r.key),
    display: String(r.display),
    backlogUserId: Number(r.backlog_user_id),
    github: (Array.isArray(r.github) ? r.github : r.github ? [r.github] : []).map((g) => String(g).toLowerCase()),
    role: r.role ?? 'khac',
  }));
}

export function memberByLogin(members: Member[], login: string): Member | undefined {
  const l = login.toLowerCase();
  return members.find((m) => m.github.some((g) => g.toLowerCase() === l));
}

/** Đọc members.yaml; file thiếu / sai cú pháp → giữ danh sách trước đó và ghi log (không đóng băng cả chu kỳ). */
export function safeLoadMembers(path: string, fallback: Member[]): Member[] {
  try {
    return loadMembers(path);
  } catch (e) {
    console.error(JSON.stringify({ level: 'error', msg: 'Không đọc được members.yaml, dùng danh sách trước đó', path, error: String(e) }));
    return fallback;
  }
}
