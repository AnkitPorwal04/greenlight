import type { OAuth2Client } from "google-auth-library";
import type { LeaveRequest } from "./types";
import { getGmail } from "./google";

interface ComposeInput {
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

function encodeMimeMessage(raw: string): string {
  return Buffer.from(raw)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function sendDecisionMail(
  client: OAuth2Client,
  input: ComposeInput & { to: string; cc: string[] }
) {
  const { subject, body } = composeDecisionMail(input);
  const gmail = getGmail(client);

  const headers = [
    `To: ${input.to}`,
    input.cc.length ? `Cc: ${input.cc.join(", ")}` : null,
    `Subject: ${subject}`,
    `Content-Type: text/plain; charset="UTF-8"`,
    `MIME-Version: 1.0`,
  ]
    .filter(Boolean)
    .join("\r\n");

  const raw = `${headers}\r\n\r\n${body}`;

  await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw: encodeMimeMessage(raw) },
  });

  return { subject, body };
}
