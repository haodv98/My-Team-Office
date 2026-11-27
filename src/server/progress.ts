// Tiến độ các milestone đang chạy.
import type { BacklogData, MilestoneProgress, ProgressBucket } from '../shared/types.js';
import { vnDayNumber, vnEndOfDay } from '../shared/time.js';

export function computeProgress(bl: BacklogData, today: Date): MilestoneProgress[] {
  return bl.milestones
    .filter((m) => new Date(m.start) <= today && today <= vnEndOfDay(new Date(m.due)))
    .map((m) => {
      const counts: Record<ProgressBucket, number> = { todo: 0, doing: 0, done: 0, closed: 0 };
      for (const t of bl.tasks) if (t.milestoneIds.includes(m.id)) counts[t.bucket]++;
      const total = counts.todo + counts.doing + counts.done + counts.closed;
      return {
        milestone: m,
        counts,
        percentClosed: total === 0 ? 0 : Math.round((counts.closed / total) * 100),
        daysLeft: Math.max(0, vnDayNumber(new Date(m.due)) - vnDayNumber(today)),
      };
    });
}
