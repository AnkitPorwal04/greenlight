import { parseLeaveDate } from "./leave-dates";

export interface DedupableRow {
  id: string;
  employeeCode: string;
  fromDate: string;
  toDate: string;
  status: string;
  kind?: string;
  source?: string;
  receivedAt?: string;
}

function spanKey(row: DedupableRow): string | null {
  if (row.kind === "cancellation") return null;
  const code = (row.employeeCode ?? "").trim().toUpperCase();
  if (!code) return null;
  const fromYmd = parseLeaveDate(row.fromDate);
  const toYmd = parseLeaveDate(row.toDate);
  if (fromYmd === null || toYmd === null) return null;
  return `${code}|${fromYmd}|${toYmd}`;
}

function receivedMs(receivedAt?: string): number {
  const ms = Date.parse(receivedAt ?? "");
  return Number.isFinite(ms) ? ms : 0;
}

function beats(candidate: DedupableRow, current: DedupableRow): boolean {
  const received = receivedMs(candidate.receivedAt);
  const receivedCurrent = receivedMs(current.receivedAt);
  if (received !== receivedCurrent) return received > receivedCurrent;

  return candidate.id > current.id;
}

export function dedupeLeaves<T extends DedupableRow>(rows: T[]): T[] {
  const keys = rows.map((row) => spanKey(row));
  const winners = new Map<string, number>();

  keys.forEach((key, index) => {
    if (key === null) return;
    const winner = winners.get(key);
    if (winner === undefined || beats(rows[index], rows[winner])) {
      winners.set(key, index);
    }
  });

  const kept = new Set(winners.values());
  return rows.filter((_, index) => keys[index] === null || kept.has(index));
}
