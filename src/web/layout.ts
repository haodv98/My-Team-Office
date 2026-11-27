// Vị trí bàn: mỗi role một dãy, chỉ phụ thuộc tập người + role (mục chờ không làm bàn đổi chỗ).
import type { Desk } from '../shared/types.js';

export const DESK_SPACING = 2.5;
export const ROW_SPACING = 4;

export interface DeskSpot {
  key: string;
  x: number;
  z: number;
  group: string;
}

export function layoutDesks(desks: Desk[]): DeskSpot[] {
  const rows = new Map<string, Desk[]>();
  for (const d of desks) rows.set(d.member.role, [...(rows.get(d.member.role) ?? []), d]);
  const roles = [...rows.keys()].sort((a, b) => a.localeCompare(b));
  return roles.flatMap((role, r) =>
    rows
      .get(role)!
      .slice()
      .sort((a, b) => a.member.display.localeCompare(b.member.display, 'vi') || a.member.key.localeCompare(b.member.key))
      .map((d, i) => ({ key: d.member.key, x: i * DESK_SPACING, z: r * ROW_SPACING, group: role })),
  );
}
