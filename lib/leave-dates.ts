// greytHR leave mails carry dates as "DD Mon YYYY" (e.g. "26 Aug 2026").
// The calendar works entirely in "YYYY-MM-DD" day strings so a day never shifts
// between the server's timezone and the viewer's browser. Lexicographic order
// of zero-padded "YYYY-MM-DD" matches chronological order, so ranges compare
// with plain string comparison.

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function toYmd(year: number, month0: number, day: number): string {
  return `${year}-${pad(month0 + 1)}-${pad(day)}`;
}

/** Only accept a Y/M/D that forms a real calendar date (rejects e.g. 31 Feb). */
function isRealDate(year: number, month0: number, day: number): boolean {
  const d = new Date(year, month0, day);
  return d.getMonth() === month0 && d.getDate() === day;
}

/**
 * Parse a "DD Mon YYYY" string into a "YYYY-MM-DD" day string.
 * Returns null when the string is empty, malformed, or an impossible date.
 */
export function parseLeaveDate(value: string): string | null {
  const m = value?.trim().match(/^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})$/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = MONTHS[m[2].slice(0, 3).toLowerCase()];
  const year = Number(m[3]);
  if (month === undefined || !isRealDate(year, month, day)) return null;
  return toYmd(year, month, day);
}

/** Today's local date as "YYYY-MM-DD". */
export function todayYmd(): string {
  const d = new Date();
  return toYmd(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Shift a "YYYY-MM-DD" day by a number of days, returning "YYYY-MM-DD". */
export function addDaysYmd(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const shifted = new Date(y, m - 1, d + delta);
  return toYmd(shifted.getFullYear(), shifted.getMonth(), shifted.getDate());
}

/** Validate a "YYYY-MM-DD" value (rejects impossible dates like 2026-02-31). */
export function isValidYmd(value: string): boolean {
  const m = value?.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return false;
  return isRealDate(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/**
 * True when a leave running fromYmd..toYmd (inclusive) covers dayYmd.
 * Order-tolerant: swaps the ends if they arrive reversed.
 */
export function leaveCoversDay(
  fromYmd: string,
  toYmd: string,
  dayYmd: string
): boolean {
  const lo = fromYmd <= toYmd ? fromYmd : toYmd;
  const hi = fromYmd <= toYmd ? toYmd : fromYmd;
  return dayYmd >= lo && dayYmd <= hi;
}

/** "Monday, 24 August 2026" for a "YYYY-MM-DD" day. */
export function longDateFromYmd(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}
