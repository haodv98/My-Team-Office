// Giờ Việt Nam (UTC+7, không đổi giờ mùa hè).
const VN_OFFSET_MS = 7 * 3600 * 1000;
const DAY_MS = 86400 * 1000;

/** Số ngày (theo lịch VN) kể từ epoch. */
export const vnDayNumber = (d: Date): number => Math.floor((d.getTime() + VN_OFFSET_MS) / DAY_MS);

/** Phần thời gian trong ngày theo giờ VN, tính bằng ms. */
export const vnTimeOfDay = (d: Date): number => (d.getTime() + VN_OFFSET_MS) % DAY_MS;

/** 0 = Chủ nhật … 6 = Thứ bảy, theo giờ VN. */
export const vnWeekday = (dayNumber: number): number => (dayNumber + 4) % 7; // 1970-01-01 là Thứ năm

/** Thời điểm cuối ngày (theo giờ VN) của ngày chứa d. */
export const vnEndOfDay = (d: Date): Date => new Date((vnDayNumber(d) + 1) * DAY_MS - VN_OFFSET_MS - 1);
