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
  const isDirect = request.source === "direct";
  const label = isCancellation ? "Cancellation" : "Application";
  const subject = isDirect
    ? `Re: ${request.leaveType} request from ${request.employeeName} [${request.employeeCode}].`
    : `Re: Leave ${label} from ${request.employeeName} [${request.employeeCode}].`;

  const decided = action === "approved" ? "approved" : "rejected";
  const span = isDirect && !dateRange ? "" : ` for ${dateRange}`;
  const line = isCancellation
    ? `Your request to cancel your ${request.leaveType}${span} has been ${decided}.`
    : `Your ${request.leaveType} request${span} has been ${decided}.`;

  const body = [`Hi ${firstName},`, ``, line].join("\n");

  return { subject, body };
}
