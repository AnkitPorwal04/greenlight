import { EMAIL_RE } from "./email";
import { formatLeaveDate, inclusiveDayCount } from "./leave-dates";
import { isUnclassifiable, UNCLASSIFIABLE } from "./classify";
import type { DirectClassification } from "./classify";
import type { Decision, LeaveRequest } from "./types";

export const DIRECT_MAX_ADDRESSES = 40;
export const DIRECT_CONFIDENT = 0.7;
export const DIRECT_FLOOR = 0.4;
export const DIRECT_MAX_DAYS = 365;

const TOPIC_TERMS = '(leave OR WFH OR "work from home" OR "day off" OR "time off")';
const EXCLUDE_SENDER = "-from:no-reply@greythr.com";
const AFTER_RE = /^\d{4}\/\d{1,2}\/\d{1,2}$/;

export interface DirectPerson {
  code: string;
  name: string;
  email: string;
}

export interface DirectMail {
  id: string;
  threadId: string;
  subject: string;
  bodyText: string;
  receivedAt: string;
  senderEmail: string;
  recipients: string[];
  selfEmail: string;
}

export function cleanDirectAddresses(emails: string[]): string[] {
  const seen = new Set<string>();
  for (const raw of Array.isArray(emails) ? emails : []) {
    const addr = String(raw ?? "").trim().toLowerCase();
    if (EMAIL_RE.test(addr)) seen.add(addr);
  }
  return [...seen];
}

export function buildDirectQuery(emails: string[], afterYmd: string): string {
  const clean = cleanDirectAddresses(emails).slice(0, DIRECT_MAX_ADDRESSES);
  if (clean.length === 0) return "";

  const senders = clean.map((e) => `"${e}"`).join(" OR ");
  const after = AFTER_RE.test(String(afterYmd ?? "").trim())
    ? ` after:${String(afterYmd).trim()}`
    : "";

  return `from:(${senders}) ${TOPIC_TERMS}${after} ${EXCLUDE_SENDER}`;
}

export function buildDirectQueries(
  emails: string[],
  afterYmd: string
): string[] {
  const clean = cleanDirectAddresses(emails);
  const queries: string[] = [];
  for (let i = 0; i < clean.length; i += DIRECT_MAX_ADDRESSES) {
    const query = buildDirectQuery(
      clean.slice(i, i + DIRECT_MAX_ADDRESSES),
      afterYmd
    );
    if (query) queries.push(query);
  }
  return queries;
}

export function replyAllCc(
  recipients: string[],
  selfEmail: string,
  senderEmail: string
): string[] {
  const self = String(selfEmail ?? "").trim().toLowerCase();
  const sender = String(senderEmail ?? "").trim().toLowerCase();
  return cleanDirectAddresses(recipients).filter(
    (addr) =>
      addr !== self && addr !== sender && !addr.startsWith("no-reply")
  );
}

export function directLeaveType(classification: DirectClassification): string {
  if (classification.kind === "wfh") return "Work From Home";
  const stated = classification.leaveType?.trim();
  return stated ? stated : "Leave";
}

export function classificationToRequest(
  mail: DirectMail,
  person: DirectPerson | null,
  classification: DirectClassification
): LeaveRequest | null {
  if (!person) return null;

  const unclear = isUnclassifiable(classification);
  const answer = unclear ? UNCLASSIFIABLE : classification;

  if (!unclear) {
    if (!answer.isRequest) return null;
    if (answer.confidence < DIRECT_FLOOR) return null;
  }

  const fromYmd = answer.fromDate;
  const toYmd = answer.toDate ?? fromYmd;
  const dated = Boolean(fromYmd && toYmd);

  const needsReview =
    unclear || !dated || answer.confidence < DIRECT_CONFIDENT;

  const numberOfDays = dated
    ? Math.min(DIRECT_MAX_DAYS, inclusiveDayCount(fromYmd!, toYmd!))
    : 1;

  const subject = mail.subject?.trim() ?? "";
  const snippet = (mail.bodyText ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);

  return {
    id: mail.id,
    threadId: mail.threadId,
    employeeName: person.name || person.email,
    employeeCode: person.code,
    employeeEmail: person.email,
    leaveType: directLeaveType(answer),
    fromDate: dated ? formatLeaveDate(fromYmd!) : "",
    toDate: dated ? formatLeaveDate(toYmd!) : "",
    numberOfDays,
    reason: subject || snippet,
    leaveBalance: "",
    fromSession: "",
    toSession: "",
    receivedAt: mail.receivedAt,
    ccRecipients: replyAllCc(mail.recipients, mail.selfEmail, mail.senderEmail),
    emailVerified: true,
    bodyText: mail.bodyText ?? "",
    status: "pending",
    kind: answer.kind === "cancellation" ? "cancellation" : "leave",
    source: "direct",
    needsReview,
  };
}

export function withDecision(
  request: LeaveRequest,
  decision: Decision | undefined
): LeaveRequest {
  return {
    ...request,
    status: decision?.status ?? "pending",
    decidedAt: decision?.decidedAt,
    decisionNote: decision?.note,
    mailSent: Boolean(decision?.sentTo),
    needsReview: decision ? false : request.needsReview,
  };
}
