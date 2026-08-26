import type { gmail_v1 } from "@googleapis/gmail";
import type { LeaveKind } from "./types";

export interface ParsedLeaveMail {
  employeeName: string;
  employeeCode: string;
  employeeEmail: string;
  leaveType: string;
  fromDate: string;
  toDate: string;
  numberOfDays: number;
  reason: string;
  leaveBalance: string;
  fromSession: string;
  toSession: string;
  ccRecipients: string[];
  kind: LeaveKind;
}

function decodeBase64Url(data: string): string {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ");
}

function collectBodies(
  part: gmail_v1.Schema$MessagePart | undefined,
  out: { plain: string[]; html: string[] }
) {
  if (!part) return;
  if (part.body?.data) {
    const text = decodeBase64Url(part.body.data);
    if (part.mimeType === "text/html") out.html.push(text);
    else out.plain.push(text);
  }
  for (const child of part.parts ?? []) collectBodies(child, out);
}

export function extractBodyText(message: gmail_v1.Schema$Message): string {
  const out = { plain: [] as string[], html: [] as string[] };
  collectBodies(message.payload, out);
  if (out.plain.length) return out.plain.join("\n").replace(/\r/g, "");
  return stripHtml(out.html.join("\n"));
}

function field(text: string, label: string): string {
  const m = text.match(new RegExp(`${label}\\s*:\\s*(.+)`, "i"));
  return m ? m[1].trim() : "";
}

function extractHeader(message: gmail_v1.Schema$Message, name: string): string {
  const h = message.payload?.headers?.find(
    (x) => x.name?.toLowerCase() === name.toLowerCase()
  );
  return h?.value ?? "";
}

function extractEmails(headerValue: string): string[] {
  return headerValue.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g) ?? [];
}

// greytHR uses "Reason:" for regular leave and "Remarks:" for restricted
// holidays. Each label has a different trailing marker, so try both.
function extractReason(text: string): string {
  const match =
    text.match(/Reason\s*:\s*([\s\S]*?)(?=\n\s*Leave Balance\s*:|$)/i) ??
    text.match(
      /Remarks\s*:\s*([\s\S]*?)(?=\n\s*(?:Click here|Note)\b|Click here|Note\s*:|$)/i
    );
  return (match?.[1] ?? "").replace(/\s+/g, " ").trim();
}

export function guessEmployeeEmail(name: string, recipients: string[]): string {
  const domain = recipients[0]?.split("@")[1];
  if (!domain || !name) return "";
  const slug = name
    .toLowerCase()
    .replace(/[^a-z\s]/g, "")
    .trim()
    .split(/\s+/)
    .join(".");
  return `${slug}@${domain}`;
}

export function parseLeaveMail(
  message: gmail_v1.Schema$Message,
  selfEmail: string
): ParsedLeaveMail | null {
  const text = extractBodyText(message);

  // "has applied for a leave" (regular), "…a restricted leave" (restricted
  // holiday), or "…a leave cancellation" (cancellation) all start "… has applied for".
  const applied = text.match(/(.+?)\s*\[([^\]]+)\]\s*has applied for/i);
  const subject = extractHeader(message, "Subject");
  // Matches "Leave Application from X [code]" and "Leave Cancellation from
  // X [code]" (greytHR puts "Cancellation" in the cancellation subject).
  const subjectMatch = subject.match(
    /(?:Application|Cancellation)\s+from\s+(.+?)\s*\[([^\]]+)\]/i
  );

  const employeeName = (applied?.[1] ?? subjectMatch?.[1] ?? "").replace(/^Hi,?\s*/i, "").trim();
  const employeeCode = (applied?.[2] ?? subjectMatch?.[2] ?? "").trim();
  if (!employeeName) return null;

  // greytHR flags a cancellation in the subject, mirroring the application
  // subject ("Leave Cancellation from …"). Match the "Leave Cancellation" /
  // "Cancellation from" marker rather than the bare word, so a normal
  // application whose employee name happens to contain "Cancellation" (or a
  // reason mentioning "cancel") is not misread. Kept flexible about surrounding
  // wording so a subject prefix does not break detection.
  const kind: LeaveKind =
    /\bleave\s+cancellation\b|\bcancellation\s+from\b/i.test(subject)
      ? "cancellation"
      : "leave";

  const recipients = [
    ...extractEmails(extractHeader(message, "To")),
    ...extractEmails(extractHeader(message, "Cc")),
  ];
  const self = selfEmail.toLowerCase();
  const ccRecipients = [...new Set(recipients.map((r) => r.toLowerCase()))].filter(
    (r) => r !== self && !r.startsWith("no-reply")
  );

  // Restricted holidays carry a single "Date:" instead of From/To Date.
  const fromDate = field(text, "From Date") || field(text, "Date");
  const toDate = field(text, "To Date") || field(text, "Date");

  // Restricted holidays omit "Number of days"; a dated single-day entry is 1.
  const explicitDays = parseFloat(field(text, "Number of days"));
  const numberOfDays = Number.isFinite(explicitDays)
    ? explicitDays
    : fromDate
      ? 1
      : 0;

  return {
    employeeName,
    employeeCode,
    employeeEmail: guessEmployeeEmail(employeeName, ccRecipients),
    leaveType: field(text, "Leave type"),
    fromDate,
    toDate,
    numberOfDays,
    reason: extractReason(text),
    leaveBalance: field(text, "Leave Balance"),
    fromSession: field(text, "From Session"),
    toSession: field(text, "To Session"),
    ccRecipients,
    kind,
  };
}
