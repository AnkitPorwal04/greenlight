import { leaveCoversDay, parseLeaveDate } from "./leave-dates";
import { cancelledLeaveTimes, isLeaveCancelled } from "./cancellation";
import type { LeaveStatus } from "./types";

export interface CalendarLeave {
  id: string;
  employeeName: string;
  employeeCode: string;
  leaveType: string;
  status: string;
  fromDate: string;
  toDate: string;
  fromYmd: string;
  toYmd: string;
  numberOfDays: number;
}

export interface CalendarCandidate {
  id: string;
  employeeName: string;
  employeeCode: string;
  leaveType: string;
  fromDate: string;
  toDate: string;
  numberOfDays: number;
  status: string;
  kind?: string;
  receivedAt?: string;
}

export const NOT_ON_LEAVE_STATUSES: LeaveStatus[] = ["rejected", "withdrawn"];

export const SETTLED_STATUSES: LeaveStatus[] = ["approved", "handled"];

export function countsAsOnLeave(status: string): boolean {
  return !(NOT_ON_LEAVE_STATUSES as string[]).includes(status);
}

export function countsAsSettled(status: string): boolean {
  return (SETTLED_STATUSES as string[]).includes(status);
}

export interface DayLeaveSections {
  approved: CalendarLeave[];
  pending: CalendarLeave[];
  total: number;
}

function byEmployeeName(a: CalendarLeave, b: CalendarLeave): number {
  return a.employeeName.localeCompare(b.employeeName);
}

export function splitDayLeaves(
  leaves: CalendarLeave[],
  dayYmd: string,
): DayLeaveSections {
  const approved: CalendarLeave[] = [];
  const pending: CalendarLeave[] = [];

  for (const leave of leaves) {
    if (!leaveCoversDay(leave.fromYmd, leave.toYmd, dayYmd)) continue;
    if (countsAsSettled(leave.status)) approved.push(leave);
    else pending.push(leave);
  }

  approved.sort(byEmployeeName);
  pending.sort(byEmployeeName);
  return { approved, pending, total: approved.length + pending.length };
}

export function toCalendarLeaves(rows: CalendarCandidate[]): CalendarLeave[] {
  // Leaves whose cancellation has been approved — the employee is no longer on
  // leave those days, so the original application is dropped below.
  const cancelled = cancelledLeaveTimes(rows);

  const out: CalendarLeave[] = [];
  for (const r of rows) {
    // A cancellation request is not itself someone being on leave.
    if (r.kind === "cancellation") continue;
    if (!countsAsOnLeave(r.status)) continue;
    if (isLeaveCancelled(r, cancelled)) continue;
    const fromYmd = parseLeaveDate(r.fromDate);
    const toYmd = parseLeaveDate(r.toDate) ?? fromYmd;
    if (fromYmd === null || toYmd === null) continue;
    out.push({
      id: r.id,
      employeeName: r.employeeName,
      employeeCode: r.employeeCode,
      leaveType: r.leaveType,
      status: r.status,
      fromDate: r.fromDate,
      toDate: r.toDate,
      fromYmd,
      toYmd,
      numberOfDays: r.numberOfDays,
    });
  }
  return out;
}
