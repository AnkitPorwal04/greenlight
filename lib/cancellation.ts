import { parseLeaveDate } from "./leave-dates";

// Correlating a greytHR "Leave Cancellation" back to the original leave it
// cancels. Both mails carry the same employee code and the same from/to dates,
// so that pair is the match key. Leave type is deliberately left out of the key:
// same employee + same exact span is already the same leave, and dropping the
// type avoids a false negative if greytHR word the type slightly differently
// between the application and the cancellation.
//
// The match is also ordered in time: a cancellation only covers requests that
// arrived at or before the cancellation mail itself, so re-applying for the same
// span afterwards stands. A request whose own arrival time is unreadable is
// still covered, so a broken timestamp cannot put a cancelled leave back on the
// calendar.

export type ReceivedTime = string | number;

export interface CancellableRow {
  employeeCode: string;
  fromDate: string;
  toDate: string;
  status: string;
  kind?: string;
  receivedAt?: ReceivedTime;
}

export interface DatedRow {
  employeeCode: string;
  fromDate: string;
  toDate: string;
  receivedAt?: ReceivedTime;
}

// A cancellation only actually cancels the leave once the manager has acted on
// it: approved it, or handled it in Gmail (auto-detected as "handled"). A
// pending cancellation leaves the original leave standing; a rejected one keeps
// it too.
const EFFECTIVE_STATUSES = new Set(["approved", "handled"]);

export function isEffectiveCancellation(row: {
  kind?: string;
  status: string;
}): boolean {
  return row.kind === "cancellation" && EFFECTIVE_STATUSES.has(row.status);
}

const COVERS_ANY_ARRIVAL = Number.POSITIVE_INFINITY;

function receivedMs(received?: ReceivedTime): number | null {
  if (typeof received === "number") {
    return Number.isFinite(received) ? received : null;
  }
  const parsed = Date.parse(received ?? "");
  return Number.isFinite(parsed) ? parsed : null;
}

function keyFor(code: string, fromYmd: string, toYmd: string): string {
  return `${code.trim().toUpperCase()}|${fromYmd}|${toYmd}`;
}

function spanKey(row: DatedRow): string | null {
  const fromYmd = parseLeaveDate(row.fromDate);
  const toYmd = parseLeaveDate(row.toDate) ?? fromYmd;
  if (fromYmd === null || toYmd === null) return null;
  return keyFor(row.employeeCode, fromYmd, toYmd);
}

// When each span (employee + date span) was cancelled, latest cancellation wins.
export function cancelledLeaveTimes(
  rows: CancellableRow[]
): Map<string, number> {
  const cancelledAt = new Map<string, number>();
  for (const r of rows) {
    if (!isEffectiveCancellation(r)) continue;
    const key = spanKey(r);
    if (key === null) continue;
    const at = receivedMs(r.receivedAt) ?? COVERS_ANY_ARRIVAL;
    const known = cancelledAt.get(key);
    if (known === undefined || at > known) cancelledAt.set(key, at);
  }
  return cancelledAt;
}

// Whether an approved cancellation covers this leave's span and arrival time.
export function isLeaveCancelled(
  row: DatedRow,
  cancelledAt: Map<string, number>
): boolean {
  if (cancelledAt.size === 0) return false;
  const key = spanKey(row);
  if (key === null) return false;
  const cancelledMs = cancelledAt.get(key);
  if (cancelledMs === undefined) return false;
  const rowMs = receivedMs(row.receivedAt);
  if (rowMs === null) return true;
  return rowMs <= cancelledMs;
}
