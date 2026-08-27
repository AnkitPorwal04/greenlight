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

function decidedRank(status: string): number {
  return status === "pending" ? 0 : 1;
}

function sourceRank(source?: string): number {
  return source === "direct" ? 0 : 1;
}

function receivedMs(receivedAt?: string): number {
  const ms = Date.parse(receivedAt ?? "");
  return Number.isFinite(ms) ? ms : 0;
}

function beats(candidate: DedupableRow, current: DedupableRow): boolean {
  const decided = decidedRank(candidate.status);
  const decidedCurrent = decidedRank(current.status);
  if (decided !== decidedCurrent) return decided > decidedCurrent;

  const source = sourceRank(candidate.source);
  const sourceCurrent = sourceRank(current.source);
  if (source !== sourceCurrent) return source > sourceCurrent;

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
