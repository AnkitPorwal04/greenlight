import type { LeaveRequest } from "./types";

export interface ComposeInput {
  request: LeaveRequest;
  action: "approved" | "rejected";
}

export function composeDecisionMail({ request, action }: ComposeInput) {
  const firstName = request.employeeName.split(/\s+/)[0];
  const dateRange =
    request.fromDate === request.toDate
      ? request.fromDate
      : `${request.fromDate} to ${request.toDate}`;

  const subject = `Re: Leave Application from ${request.employeeName} [${request.employeeCode}] — ${
    action === "approved" ? "Approved" : "Rejected"
  }`;

  const body = [
    `Hi ${firstName},`,
    ``,
    `Your ${request.leaveType} request for ${dateRange} has been ${
      action === "approved" ? "approved" : "rejected"
    }.`,
  ].join("\n");

  return { subject, body };
}
