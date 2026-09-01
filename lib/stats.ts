import type { LeaveStatus } from "./types";
import { filterByTeam } from "./team";

export interface StatsEntry {
  id: string;
  employeeName: string;
  employeeCode: string;
  leaveType: string;
  numberOfDays: number;
  receivedAt: string;
  status?: LeaveStatus;
}

export interface StatsMonth {
  month: string;
  total: number;
  byType: Record<string, number>;
}

export interface StatsEmployeeOutcomes {
  approved: number;
  rejected: number;
  withdrawn: number;
  handled: number;
  pending: number;
}

export type StatsOutcome = keyof StatsEmployeeOutcomes;

export interface StatsEmployeeEntry {
  receivedAt: string;
  leaveType: string;
  numberOfDays: number;
  status: StatsOutcome;
}

export interface StatsEmployee {
  code: string;
  name: string;
  requests: number;
  days: number;
  byType: Record<string, number>;
  outcomes: StatsEmployeeOutcomes;
  entries: StatsEmployeeEntry[];
}

export interface StatsType {
  type: string;
  requests: number;
  days: number;
}

export interface StatsOutcomes {
  applied: number;
  approved: number;
  rejected: number;
  withdrawn: number;
  handled: number;
  pending: number;
}

export interface StatsPayload {
  totalRequests: number;
  sinceDate: string;
  outcomes: StatsOutcomes;
  byMonth: StatsMonth[];
  byEmployee: StatsEmployee[];
  byType: StatsType[];
}

const FALLBACK_TYPE = "Unspecified";

function safeDays(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function typeName(value: string): string {
  const trimmed = value.trim();
  return trimmed || FALLBACK_TYPE;
}

// Bucket months in UTC so a request always lands in the same month regardless
// of the server's timezone, and so the client-side member lookup (which only
// has the ISO string) can reproduce the exact same bucket.
function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(d: Date): string {
  return d.toLocaleDateString("en-GB", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function bump(bucket: Record<string, number>, key: string, by: number) {
  bucket[key] = (bucket[key] ?? 0) + by;
}

function receivedTime(value: string): number {
  const ts = new Date(value).getTime();
  return Number.isNaN(ts) ? 0 : ts;
}

function outcomeOf(status: LeaveStatus | undefined): StatsOutcome {
  return status === "approved" ||
    status === "rejected" ||
    status === "withdrawn" ||
    status === "handled"
    ? status
    : "pending";
}

export function aggregateStatsForTeam(
  entries: StatsEntry[],
  team: string[]
): StatsPayload {
  return aggregateStats(filterByTeam(entries, team));
}

export function aggregateStats(entries: StatsEntry[]): StatsPayload {
  const unique = new Map<string, StatsEntry>();
  for (const entry of entries) {
    if (!entry.id || unique.has(entry.id)) continue;
    unique.set(entry.id, entry);
  }

  const months = new Map<string, { label: string; month: StatsMonth }>();
  const employees = new Map<string, StatsEmployee>();
  const types = new Map<string, StatsType>();
  const outcomes: StatsOutcomes = {
    applied: 0,
    approved: 0,
    rejected: 0,
    withdrawn: 0,
    handled: 0,
    pending: 0,
  };
  let earliest = Number.POSITIVE_INFINITY;

  for (const entry of unique.values()) {
    const type = typeName(entry.leaveType);
    const days = safeDays(entry.numberOfDays);
    const received = new Date(entry.receivedAt);
    const validDate = !Number.isNaN(received.getTime());

    const outcome = outcomeOf(entry.status);
    const counted = outcome !== "withdrawn";

    outcomes[outcome] += 1;
    if (counted) outcomes.applied += 1;

    if (validDate) earliest = Math.min(earliest, received.getTime());

    if (counted && validDate) {
      const key = monthKey(received);
      let slot = months.get(key);
      if (!slot) {
        slot = {
          label: key,
          month: { month: monthLabel(received), total: 0, byType: {} },
        };
        months.set(key, slot);
      }
      slot.month.total += 1;
      bump(slot.month.byType, type, 1);
    }

    const code = entry.employeeCode.trim().toUpperCase();
    const employeeKey = code || entry.employeeName.trim().toLowerCase();
    if (employeeKey) {
      let person = employees.get(employeeKey);
      if (!person) {
        person = {
          code: code || "—",
          name: entry.employeeName.trim() || "Unknown",
          requests: 0,
          days: 0,
          byType: {},
          outcomes: {
            approved: 0,
            rejected: 0,
            withdrawn: 0,
            handled: 0,
            pending: 0,
          },
          entries: [],
        };
        employees.set(employeeKey, person);
      }
      person.outcomes[outcome] += 1;
      if (counted) {
        person.requests += 1;
        person.days += days;
        bump(person.byType, type, 1);
      }
      person.entries.push({
        receivedAt: entry.receivedAt,
        leaveType: type,
        numberOfDays: days,
        status: outcome,
      });
    }

    if (counted) {
      let typeRow = types.get(type);
      if (!typeRow) {
        typeRow = { type, requests: 0, days: 0 };
        types.set(type, typeRow);
      }
      typeRow.requests += 1;
      typeRow.days += days;
    }
  }

  const byMonth = [...months.values()]
    .sort((a, b) => a.label.localeCompare(b.label))
    .map((slot) => slot.month);

  const byEmployee = [...employees.values()]
    .map((person) => ({
      ...person,
      days: round(person.days),
      entries: person.entries.sort(
        (a, b) => receivedTime(b.receivedAt) - receivedTime(a.receivedAt)
      ),
    }))
    .sort((a, b) => b.days - a.days || b.requests - a.requests);

  const byType = [...types.values()]
    .map((row) => ({ ...row, days: round(row.days) }))
    .sort((a, b) => b.requests - a.requests || b.days - a.days);

  return {
    totalRequests: unique.size,
    sinceDate: Number.isFinite(earliest)
      ? new Date(earliest).toISOString()
      : "",
    outcomes,
    byMonth,
    byEmployee,
    byType,
  };
}
