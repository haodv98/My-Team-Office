// Bàn nào hiện robot: chủ tài khoản có agent vừa gửi / đang chờ (spec §5.2: "agent của X" ở bàn X).
import type { Snapshot } from '../shared/types.js';

const RECENT_MS = 30 * 60_000;

export function agentActiveKeys(s: Pick<Snapshot, 'desks' | 'events'>, now: Date): Set<string> {
  const keys = new Set<string>();
  for (const d of s.desks) for (const w of d.waits) if (w.sender.viaAgent && w.sender.memberKey) keys.add(w.sender.memberKey);
  for (const e of s.events) if (e.viaAgent && e.from && now.getTime() - new Date(e.at).getTime() <= RECENT_MS) keys.add(e.from);
  return keys;
}
