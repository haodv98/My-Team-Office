// Ghép PR với task Backlog và người (thiết kế §5.2).
import type { Actor, DeskPr, Member, PullRequest, Task } from '../shared/types.js';
import { memberByLogin } from './config.js';

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const uniqSorted = (xs: number[]) => [...new Set(xs)].sort((a, b) => a - b);

/** Số task Backlog mà PR nhắc tới; dừng ở luật đầu tiên có kết quả. */
export function extractTaskNumbers(pr: PullRequest, projectKey: string): number[] {
  const fullKey = new RegExp(`\\b${escapeRe(projectKey)}-(\\d+)\\b`, 'g');
  const full = [pr.title, pr.branch, pr.body].flatMap((s) => [...s.matchAll(fullKey)].map((m) => Number(m[1])));
  if (full.length) return uniqSorted(full);

  const branch = /^[a-z]+\/(\d+)(?:-(\d+))?-/i.exec(pr.branch);
  if (branch) return uniqSorted([branch[1], branch[2]].filter((x): x is string => !!x).map(Number));

  const title = /^[a-z]+\(#(\d+)\)/i.exec(pr.title);
  if (title) return [Number(title[1])];
  return [];
}

/** Người nhận PR: người được giao task (nếu có) — không phải người mở PR. */
export function attributePr(
  pr: PullRequest,
  tasks: Map<number, Task>,
  members: Member[],
  projectKey: string,
): { memberKeys: string[]; taskNumbers: number[] } {
  const taskNumbers = extractTaskNumbers(pr, projectKey).filter((n) => tasks.has(n));
  const keys: string[] = [];
  for (const n of taskNumbers) {
    const assignee = tasks.get(n)?.assigneeId;
    const m = assignee == null ? undefined : members.find((x) => x.backlogUserId === assignee);
    if (m && !keys.includes(m.key)) keys.push(m.key);
  }
  if (keys.length === 0) {
    const author = memberByLogin(members, pr.author);
    if (author) keys.push(author.key);
  }
  return { memberKeys: keys, taskNumbers };
}

/** Người viết comment / review. Comment agent tính cho chủ tài khoản. */
export function resolveActor(login: string, body: string, members: Member[], agentMarkers: string[]): Actor {
  return {
    memberKey: memberByLogin(members, login)?.key ?? null,
    login,
    viaAgent: agentMarkers.some((m) => body.includes(m)),
  };
}

/** Dạng rút gọn của PR để đặt lên bàn / bảng. */
export function toDeskPr(pr: PullRequest, taskNumbers: number[]): DeskPr {
  return { repo: pr.repo, number: pr.number, title: pr.title, url: pr.url, draft: pr.draft, taskNumbers };
}
