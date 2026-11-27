import type { Snapshot } from './types.js';

/** Phiên bản snapshot cho trình duyệt: đổi khi dữ liệu mới HOẶC khi trạng thái nguồn lỗi đổi. */
export const snapshotRev = (s: Pick<Snapshot, 'generatedAt' | 'staleSources'>): string =>
  [s.generatedAt, ...[...s.staleSources].sort()].join('|');
