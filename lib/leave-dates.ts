// greytHR leave mails carry dates as "DD Mon YYYY" (e.g. "26 Aug 2026").
// These helpers turn those into real day boundaries so we can ask "who is on
// leave on a given day".

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/**
 * Parse a "DD Mon YYYY" string into the local-time start-of-day, in ms.
 * Returns null when the string is empty or not in that shape.
 */
export function parseLeaveDate(value: string): number | null {
  const m = value?.trim().match(/^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})$/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = MONTHS[m[2].slice(0, 3).toLowerCase()];
  const year = Number(m[3]);
  if (month === undefined || day < 1 || day > 31) return null;
  const d = new Date(year, month, day);
  // Guard against overflow (e.g. "31 Feb" rolling into March).
  if (d.getMonth() !== month || d.getDate() !== day) return null;
  return d.getTime();
}

/** Start-of-day (local) in ms for a given ms timestamp. */
export function startOfDayMs(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** "YYYY-MM-DD" (local) for an <input type="date"> value. */
export function toDayInput(ms: number): string {
  const d = new Date(ms);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Parse a "YYYY-MM-DD" input value into local start-of-day ms, or null. */
export function fromDayInput(value: string): number | null {
  const m = value?.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d.getTime();
}

/**
 * True when a leave running from `fromMs`..`toMs` (inclusive day range) covers
 * the day `dayMs`. All three are compared at day granularity.
 */
export function leaveCoversDay(
  fromMs: number,
  toMs: number,
  dayMs: number
): boolean {
  const day = startOfDayMs(dayMs);
  const start = startOfDayMs(Math.min(fromMs, toMs));
  const end = startOfDayMs(Math.max(fromMs, toMs));
  return day >= start && day <= end;
}
