import { parseLeaveDate } from "./leave-dates";

// Correlating a greytHR "Leave Cancellation" back to the original leave it
// cancels. Both mails carry the same employee code and the same from/to dates,
// so that pair is the match key. Leave type is deliberately left out of the key:
// same employee + same exact span is already the same leave, and dropping the
// type avoids a false negative if greytHR word the type slightly differently
// between the application and the cancellation.

export interface CancellableRow {
  employeeCode: string;
  fromDate: string;
  toDate: string;
  status: string;
  kind?: string;
}

export interface DatedRow {
  employeeCode: string;
  fromDate: string;
  toDate: string;
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

function keyFor(code: string, fromYmd: string, toYmd: string): string {
  return `${code.trim().toUpperCase()}|${fromYmd}|${toYmd}`;
}

function spanKey(row: DatedRow): string | null {
  const fromYmd = parseLeaveDate(row.fromDate);
  const toYmd = parseLeaveDate(row.toDate) ?? fromYmd;
  if (fromYmd === null || toYmd === null) return null;
  return keyFor(row.employeeCode, fromYmd, toYmd);
}

// Keys (employee + date span) of leaves whose cancellation has been approved.
export function cancelledLeaveKeys(rows: CancellableRow[]): Set<string> {
  const keys = new Set<string>();
  for (const r of rows) {
    if (!isEffectiveCancellation(r)) continue;
    const key = spanKey(r);
    if (key !== null) keys.add(key);
  }
  return keys;
}

// Whether a given leave has an approved cancellation covering the same span.
export function isLeaveCancelled(
  row: DatedRow,
  cancelledKeys: Set<string>
): boolean {
  if (cancelledKeys.size === 0) return false;
  const key = spanKey(row);
  return key !== null && cancelledKeys.has(key);
}
