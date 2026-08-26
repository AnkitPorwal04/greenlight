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

  const isCancellation = request.kind === "cancellation";
  const label = isCancellation ? "Cancellation" : "Application";
  const subject = `Re: Leave ${label} from ${request.employeeName} [${request.employeeCode}].`;

  const decided = action === "approved" ? "approved" : "rejected";
  const line = isCancellation
    ? `Your request to cancel your ${request.leaveType} for ${dateRange} has been ${decided}.`
    : `Your ${request.leaveType} request for ${dateRange} has been ${decided}.`;

  const body = [`Hi ${firstName},`, ``, line].join("\n");

  return { subject, body };
}
