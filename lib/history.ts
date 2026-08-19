import type { LeaveRequest } from "./types";

export const DEFAULT_HISTORY_MONTHS = 2;
export const MAX_HISTORY_MONTHS = 12;

export interface HistoryMonth {
  key: string;
  label: string;
  count: number;
  requests: LeaveRequest[];
}

export interface MonthTotals {
  total: number;
  approved: number;
  rejected: number;
  handled: number;
}

export function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function monthStart(now: Date, monthsBack: number): Date {
  return new Date(now.getFullYear(), now.getMonth() - monthsBack, 1);
}

export function gmailAfterDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}/${month}/${day}`;
}

export function historyMonthCount(raw: string | null): number {
  const parsed = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(parsed)) return DEFAULT_HISTORY_MONTHS;
  return Math.min(MAX_HISTORY_MONTHS, Math.max(1, parsed));
}

function monthFromKey(key: string): Date {
  const [year, month] = key.split("-").map((part) => Number.parseInt(part, 10));
  return new Date(year, month - 1, 1);
}

export function monthLabel(date: Date, now: Date): string {
  const name = date.toLocaleDateString("en-GB", { month: "long" });
  return date.getFullYear() === now.getFullYear()
    ? name
    : `${name} ${date.getFullYear()}`;
}

function receivedTime(value: string): number {
  const ts = new Date(value).getTime();
  return Number.isNaN(ts) ? 0 : ts;
}

export function decidedInMonth(
  requests: LeaveRequest[],
  key: string
): LeaveRequest[] {
  return requests.filter((request) => {
    if (request.status === "pending") return false;
    const received = new Date(request.receivedAt);
    if (Number.isNaN(received.getTime())) return false;
    return monthKey(received) === key;
  });
}

export function monthTotals(requests: LeaveRequest[]): MonthTotals {
  const totals: MonthTotals = {
    total: 0,
    approved: 0,
    rejected: 0,
    handled: 0,
  };
  for (const request of requests) {
    if (request.status === "approved") totals.approved += 1;
    else if (request.status === "rejected") totals.rejected += 1;
    else if (request.status === "handled") totals.handled += 1;
    else continue;
    totals.total += 1;
  }
  return totals;
}

export function buildHistoryMonths(
  requests: LeaveRequest[],
  now: Date = new Date(),
  minMonths: number = DEFAULT_HISTORY_MONTHS
): HistoryMonth[] {
  const buckets = new Map<string, LeaveRequest[]>();
  for (let back = 0; back < Math.max(1, minMonths); back += 1) {
    buckets.set(monthKey(monthStart(now, back)), []);
  }

  for (const request of requests) {
    const received = new Date(request.receivedAt);
    if (Number.isNaN(received.getTime())) continue;
    const key = monthKey(received);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(request);
    else buckets.set(key, [request]);
  }

  return [...buckets.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, items]) => ({
      key,
      label: monthLabel(monthFromKey(key), now),
      count: items.length,
      requests: items.sort(
        (a, b) => receivedTime(b.receivedAt) - receivedTime(a.receivedAt)
      ),
    }));
}
