import { parseLeaveDate } from "./leave-dates";
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
}

export const NOT_ON_LEAVE_STATUSES: LeaveStatus[] = ["rejected", "withdrawn"];

export function countsAsOnLeave(status: string): boolean {
  return !(NOT_ON_LEAVE_STATUSES as string[]).includes(status);
}

export function toCalendarLeaves(rows: CalendarCandidate[]): CalendarLeave[] {
  const out: CalendarLeave[] = [];
  for (const r of rows) {
    // A cancellation request is not someone being on leave.
    if (r.kind === "cancellation") continue;
    if (!countsAsOnLeave(r.status)) continue;
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
