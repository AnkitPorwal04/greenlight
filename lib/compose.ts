import type { LeaveRequest } from "./types";

export interface ComposeInput {
  request: LeaveRequest;
  action: "approved" | "rejected";
  note?: string;
}

export function composeDecisionMail({ request, action, note }: ComposeInput) {
  const firstName = request.employeeName.split(/\s+/)[0];
  const dateRange =
    request.fromDate === request.toDate
      ? request.fromDate
      : `${request.fromDate} to ${request.toDate}`;
  const days =
    request.numberOfDays === 1 ? "1 day" : `${request.numberOfDays} days`;

  const subject = `Re: Leave Application from ${request.employeeName} [${request.employeeCode}] — ${
    action === "approved" ? "Approved" : "Not Approved"
  }`;

  const approvedBody = [
    `Hi ${firstName},`,
    ``,
    `Good news — your ${request.leaveType} request for ${dateRange} (${days}) has been approved.`,
    ``,
    note ? `${note}\n` : null,
    `Please make sure any pending work is handed over or covered, and stay reachable if anything urgent comes up.`,
    ``,
    `Take care!`,
    ``,
    `Best regards`,
  ]
    .filter((line) => line !== null)
    .join("\n");

  const rejectedBody = [
    `Hi ${firstName},`,
    ``,
    `Thank you for applying for ${request.leaveType} for ${dateRange} (${days}). Unfortunately, I'm unable to approve this request at the moment.`,
    ``,
    note ? `Reason: ${note}\n` : null,
    `Please feel free to reach out to me directly so we can discuss this and figure out an alternative that works for everyone.`,
    ``,
    `Best regards`,
  ]
    .filter((line) => line !== null)
    .join("\n");

  return {
    subject,
    body: action === "approved" ? approvedBody : rejectedBody,
  };
}
