// Câu chữ hiển thị dùng chung cho bản 2D và 3D.
import type { Actor, Member, OfficeEvent, WaitItem } from '../shared/types.js';

export const nameOf = (members: Map<string, Member>, key: string | null, fallback = '?'): string =>
  (key && members.get(key)?.display) || key || fallback;

const actorName = (a: Actor, members: Map<string, Member>) =>
  `${a.memberKey ? nameOf(members, a.memberKey) : a.login}${a.viaAgent ? ' (agent)' : ''}`;

const prNumber = (url: string) => /\/pull\/(\d+)/.exec(url)?.[1] ?? '?';

export function waitLabel(w: WaitItem, members: Map<string, Member>): string {
  const who = nameOf(members, w.recipient);
  switch (w.kind) {
    case 'review':
      return `Chờ ${who} review PR #${prNumber(w.url)}`;
    case 'fix':
      return `Chờ ${who} sửa theo review của ${actorName({ ...w.sender, viaAgent: false }, members)}`;
    case 'gh_mention':
      return `${actorName(w.sender, members)} nhắc ${who} trên PR #${prNumber(w.url)}`;
    case 'backlog_notify':
      return `${actorName(w.sender, members)} báo ${who} trên ${w.title.split(' ')[0]}`;
  }
}

const EVENT_VERB: Record<OfficeEvent['type'], string> = {
  pr_opened: 'mở PR',
  pr_merged: 'PR đã merge',
  pr_closed: 'PR đã đóng',
  review: 'review',
  gh_comment: 'comment',
  review_requested: 'nhờ review',
  backlog_comment: 'comment Backlog',
  task_status: 'đổi trạng thái',
};

export function eventLabel(e: OfficeEvent, members: Map<string, Member>): string {
  const from = e.from ? `${nameOf(members, e.from)}${e.viaAgent ? ' (agent)' : ''}` : '';
  const to = e.to.length ? ` → ${e.to.map((k) => nameOf(members, k)).join(', ')}` : '';
  return `${from ? `${from} · ` : ''}${EVENT_VERB[e.type]}${to}: ${e.title}`;
}

export function ago(iso: string, now: Date): string {
  const min = Math.floor((now.getTime() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'vừa xong';
  if (min < 60) return `${min} phút trước`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} giờ trước`;
  return `${Math.floor(h / 24)} ngày trước`;
}

export const hhmm = (iso: string) =>
  new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' });

export function staleBanner(staleSources: ('github' | 'backlog')[], generatedAt: string): string | null {
  if (!staleSources.length) return null;
  const names = staleSources.map((s) => (s === 'github' ? 'GitHub' : 'Backlog')).join(' và ');
  return `Dữ liệu ${names} chưa cập nhật được, đang hiện bản lúc ${hhmm(generatedAt)}.`;
}

export const OFFLINE_BANNER = 'Mất kết nối tới máy chủ, đang thử lại…';

/** Thoát HTML cho dữ liệu lấy từ GitHub / Backlog. */
export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** Chỉ cho link http(s). */
export const safeUrl = (u: string) => (/^https?:\/\//i.test(u) ? u : '#');
