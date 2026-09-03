import type { LeaveStatus } from "./types";
import { filterByTeam, teamCode } from "./team";
import {
  addDaysYmd,
  isValidYmd,
  leaveCoversDay,
  parseLeaveDate,
} from "./leave-dates";

export interface StatsEntry {
  id: string;
  employeeName: string;
  employeeCode: string;
  leaveType: string;
  numberOfDays: number;
  fromDate: string;
  toDate: string;
  receivedAt: string;
  status?: LeaveStatus;
}

export type StatsEmployeeDays = {
  approved: number;
  rejected: number;
  handled: number;
  pending: number;
};

export type StatsOutcome = keyof StatsEmployeeDays;

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
  daysByType: Record<string, number>;
  daysByOutcome: StatsEmployeeDays;
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
  handled: number;
  pending: number;
}

export interface StatsMonthTab {
  key: string;
  label: string;
  count: number;
}

export interface StatsRosterMember {
  code: string;
  name: string;
}

export interface StatsPayload {
  totalRequests: number;
  sinceDate: string;
  outcomes: StatsOutcomes;
  byEmployee: StatsEmployee[];
  byType: StatsType[];
  entries: StatsEntry[];
  roster?: StatsRosterMember[];
}

const FALLBACK_TYPE = "Unspecified";

function safeDays(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function typeName(value: string): string {
  const trimmed = value.trim();
  return trimmed || FALLBACK_TYPE;
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(d: Date): string {
  return d.toLocaleDateString("en-GB", {
    month: "short",
    year: "numeric",
  });
}

function monthFromKey(key: string): Date | null {
  const [year, month] = key.split("-").map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return null;
  if (month < 1 || month > 12) return null;
  return new Date(year, month - 1, 1);
}

export function statsMonthKey(receivedAt: string): string {
  const d = new Date(receivedAt);
  if (!receivedAt || Number.isNaN(d.getTime())) return "";
  return monthKey(d);
}

export function statsMonthShortLabel(key: string): string {
  const d = monthFromKey(key);
  return d ? monthLabel(d) : key;
}

export function statsMonthLabel(key: string): string {
  const d = monthFromKey(key);
  if (!d) return key;
  return d.toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });
}

const UNUSABLE_SPAN_DAYS = 366;

function monthOfYmd(ymd: string): string {
  return ymd.slice(0, 7);
}

function entrySpan(entry: StatsEntry): { from: string; to: string } | null {
  const from = parseLeaveDate(entry.fromDate);
  const to = parseLeaveDate(entry.toDate) ?? from;
  if (from === null || to === null) return null;
  return from <= to ? { from, to } : { from: to, to: from };
}

function coveredDays(entry: StatsEntry): string[] {
  const span = entrySpan(entry);
  if (span === null) return [];

  const days: string[] = [];
  let day = span.from;
  while (isValidYmd(day) && leaveCoversDay(span.from, span.to, day)) {
    if (days.length >= UNUSABLE_SPAN_DAYS) return [];
    days.push(day);
    day = addDaysYmd(day, 1);
  }
  return days;
}

function entryMonthKeys(entry: StatsEntry): string[] {
  const days = coveredDays(entry);
  if (days.length === 0) {
    const fallback = statsMonthKey(entry.receivedAt);
    return fallback ? [fallback] : [];
  }
  return [...new Set(days.map(monthOfYmd))];
}

export function isWithdrawn(entry: Pick<StatsEntry, "status">): boolean {
  return entry.status === "withdrawn";
}

export function buildStatsMonths(
  entries: StatsEntry[],
  now: Date = new Date()
): StatsMonthTab[] {
  const counts = new Map<string, number>();
  if (!Number.isNaN(now.getTime())) counts.set(monthKey(now), 0);

  for (const entry of entries) {
    if (isWithdrawn(entry)) continue;
    for (const key of entryMonthKeys(entry)) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, count]) => ({ key, label: statsMonthLabel(key), count }));
}

function statsEmployeeKey(entry: StatsEntry): string {
  const code = entry.employeeCode.trim().toUpperCase();
  const name = entry.employeeName.trim().toLowerCase();
  return code || name || `#${entry.id}`;
}

function arrivedLater(candidate: StatsEntry, current: StatsEntry): boolean {
  const received = receivedTime(candidate.receivedAt);
  const receivedCurrent = receivedTime(current.receivedAt);
  if (received !== receivedCurrent) return received > receivedCurrent;

  return candidate.id > current.id;
}

function dayOwners(
  entries: StatsEntry[],
  spans: string[][]
): Map<string, number> {
  const owners = new Map<string, number>();
  spans.forEach((days, index) => {
    for (const day of days) {
      const dayKey = `${statsEmployeeKey(entries[index])}|${day}`;
      const current = owners.get(dayKey);
      if (current === undefined || arrivedLater(entries[index], entries[current])) {
        owners.set(dayKey, index);
      }
    }
  });
  return owners;
}

export interface DailyLeavePoint {
  ymd: string;
  day: number;
  people: number;
}

const MONTH_KEY_SHAPE = /^\d{4}-(0[1-9]|1[0-2])$/;
const LONGEST_MONTH_DAYS = 31;

function calendarDaysOfMonth(key: string): string[] {
  if (!MONTH_KEY_SHAPE.test(key)) return [];

  const days: string[] = [];
  for (let day = 1; day <= LONGEST_MONTH_DAYS; day += 1) {
    const ymd = `${key}-${String(day).padStart(2, "0")}`;
    if (!isValidYmd(ymd)) break;
    days.push(ymd);
  }
  return days;
}

export function dailyLeaveCounts(
  entries: StatsEntry[],
  monthKey: string
): DailyLeavePoint[] {
  const calendar = calendarDaysOfMonth(monthKey);
  if (calendar.length === 0) return [];

  const peopleByDay = new Map<string, Set<string>>();
  for (const entry of entries) {
    if (isWithdrawn(entry)) continue;

    const person = statsEmployeeKey(entry);
    for (const day of coveredDays(entry)) {
      if (monthOfYmd(day) !== monthKey) continue;
      let onLeave = peopleByDay.get(day);
      if (!onLeave) {
        onLeave = new Set<string>();
        peopleByDay.set(day, onLeave);
      }
      onLeave.add(person);
    }
  }

  return calendar.map((ymd) => ({
    ymd,
    day: Number(ymd.slice(8)),
    people: peopleByDay.get(ymd)?.size ?? 0,
  }));
}

const MAX_CHART_TICKS = 4;

export function chartTicks(peak: number): number[] {
  const highest = Number.isFinite(peak) ? Math.max(0, Math.ceil(peak)) : 0;
  if (highest === 0) return [0, 1];

  const spans = MAX_CHART_TICKS - 1;
  let step = 1;
  while (Math.ceil(highest / step) > spans) step += 1;

  const ceiling = step * Math.ceil(highest / step);
  const ticks: number[] = [];
  for (let value = 0; value <= ceiling; value += step) ticks.push(value);
  return ticks;
}

export function narrowDayLabels(count: number): boolean[] {
  if (!Number.isFinite(count) || count <= 0) return [];

  const last = Math.floor(count) - 1;
  return Array.from({ length: Math.floor(count) }, (_, index) => {
    if (index === 0 || index === last) return true;
    if (index === last - 1) return false;
    return index % 2 === 0;
  });
}

export function entriesInMonth(
  entries: StatsEntry[],
  key: string
): StatsEntry[] {
  if (!key) return [];

  const spans = entries.map(coveredDays);
  const owners = dayOwners(entries, spans);

  const out: StatsEntry[] = [];
  entries.forEach((entry, index) => {
    const days = spans[index];
    if (days.length === 0) {
      if (statsMonthKey(entry.receivedAt) === key) out.push(entry);
      return;
    }

    const inMonth = days.filter((day) => monthOfYmd(day) === key);
    if (inMonth.length === 0) return;

    const won = inMonth.filter(
      (day) => owners.get(`${statsEmployeeKey(entry)}|${day}`) === index
    );
    const share = safeDays(entry.numberOfDays) / days.length;
    out.push({ ...entry, numberOfDays: round(share * won.length) });
  });
  return out;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function bump(bucket: Record<string, number>, key: string, by: number) {
  bucket[key] = (bucket[key] ?? 0) + by;
}

function roundEach<T extends Record<string, number>>(bucket: T): T {
  const rounded = {} as T;
  for (const [key, value] of Object.entries(bucket)) {
    rounded[key as keyof T] = round(value) as T[keyof T];
  }
  return rounded;
}

function receivedTime(value: string): number {
  const ts = new Date(value).getTime();
  return Number.isNaN(ts) ? 0 : ts;
}

function outcomeOf(status: LeaveStatus | undefined): StatsOutcome {
  return status === "approved" || status === "rejected" || status === "handled"
    ? status
    : "pending";
}

function byDaysThenRequests(a: StatsEmployee, b: StatsEmployee): number {
  return b.days - a.days || b.requests - a.requests;
}

function groupingKey(code: string, name: string): string {
  return code.trim().toUpperCase() || name.trim().toLowerCase();
}

export interface StatsTypeDays {
  type: string;
  days: number;
}

const BREAKDOWN_TYPES = 4;

export function topDaysByType(
  daysByType: Record<string, number>,
  limit: number = BREAKDOWN_TYPES
): StatsTypeDays[] {
  return Object.entries(daysByType ?? {})
    .filter(([, days]) => Number.isFinite(days) && days > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, Math.max(0, limit))
    .map(([type, days]) => ({ type, days }));
}

export function teamRoster(
  team: string[],
  directory: Record<string, { name?: string }> = {}
): StatsRosterMember[] {
  const members: StatsRosterMember[] = [];
  const seen = new Set<string>();

  for (const raw of Array.isArray(team) ? team : []) {
    const code = teamCode(raw);
    if (!code || seen.has(code)) continue;
    seen.add(code);
    members.push({ code, name: directory[code]?.name?.trim() || code });
  }

  return members;
}

export function fillTeamRoster(
  byEmployee: StatsEmployee[],
  roster: StatsRosterMember[] | undefined
): StatsEmployee[] {
  if (!roster?.length) return byEmployee;

  const taken = new Set(
    byEmployee.map((person) => groupingKey(person.code, person.name))
  );

  const filled = [...byEmployee];
  for (const member of roster) {
    const code = teamCode(member.code);
    const key = groupingKey(code, member.name);
    if (!key || taken.has(key)) continue;
    taken.add(key);
    filled.push({
      code: code || "—",
      name: member.name.trim() || code || "Unknown",
      requests: 0,
      days: 0,
      daysByType: {},
      daysByOutcome: { approved: 0, rejected: 0, handled: 0, pending: 0 },
      entries: [],
    });
  }

  return filled.sort(byDaysThenRequests);
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
    if (!entry.id || unique.has(entry.id) || isWithdrawn(entry)) continue;
    unique.set(entry.id, entry);
  }

  const employees = new Map<string, StatsEmployee>();
  const types = new Map<string, StatsType>();
  const outcomes: StatsOutcomes = {
    applied: 0,
    approved: 0,
    rejected: 0,
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

    outcomes[outcome] += 1;
    outcomes.applied += 1;

    if (validDate) earliest = Math.min(earliest, received.getTime());

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
          daysByType: {},
          daysByOutcome: {
            approved: 0,
            rejected: 0,
            handled: 0,
            pending: 0,
          },
          entries: [],
        };
        employees.set(employeeKey, person);
      }
      person.daysByOutcome[outcome] += days;
      person.requests += 1;
      person.days += days;
      bump(person.daysByType, type, days);
      person.entries.push({
        receivedAt: entry.receivedAt,
        leaveType: type,
        numberOfDays: days,
        status: outcome,
      });
    }

    let typeRow = types.get(type);
    if (!typeRow) {
      typeRow = { type, requests: 0, days: 0 };
      types.set(type, typeRow);
    }
    typeRow.requests += 1;
    typeRow.days += days;
  }

  const byEmployee = [...employees.values()]
    .map((person) => ({
      ...person,
      days: round(person.days),
      daysByType: roundEach(person.daysByType),
      daysByOutcome: roundEach(person.daysByOutcome),
      entries: person.entries.sort(
        (a, b) => receivedTime(b.receivedAt) - receivedTime(a.receivedAt)
      ),
    }))
    .sort(byDaysThenRequests);

  const byType = [...types.values()]
    .map((row) => ({ ...row, days: round(row.days) }))
    .sort((a, b) => b.requests - a.requests || b.days - a.days);

  return {
    totalRequests: unique.size,
    sinceDate: Number.isFinite(earliest)
      ? new Date(earliest).toISOString()
      : "",
    outcomes,
    byEmployee,
    byType,
    entries: [...unique.values()],
  };
}
