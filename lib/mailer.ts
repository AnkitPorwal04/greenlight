import type { OAuth2Client } from "google-auth-library";
import { getGmail } from "./google";
import { composeDecisionMail, type ComposeInput } from "./compose";

export { composeDecisionMail };

function encodeMimeMessage(raw: string): string {
  return Buffer.from(raw)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function sanitizeHeaderValue(value: string): string {
  return value.replace(/[\r\n]/g, "").trim();
}

export function encodeSubjectHeader(subject: string): string {
  const encoded = /^[\x20-\x7e]*$/.test(subject)
    ? subject
    : `=?UTF-8?B?${Buffer.from(subject, "utf8").toString("base64")}?=`;
  return sanitizeHeaderValue(encoded);
}

export function buildRawMessage(parts: {
  to: string;
  cc: string[];
  subject: string;
  inReplyTo: string;
  htmlBody: string;
}): string {
  const inReplyTo = sanitizeHeaderValue(parts.inReplyTo);
  const cc = parts.cc.map(sanitizeHeaderValue).filter(Boolean);
  const headers = [
    `To: ${sanitizeHeaderValue(parts.to)}`,
    cc.length ? `Cc: ${cc.join(", ")}` : null,
    `Subject: ${encodeSubjectHeader(parts.subject)}`,
    inReplyTo ? `In-Reply-To: ${inReplyTo}` : null,
    inReplyTo ? `References: ${inReplyTo}` : null,
    `Content-Type: text/html; charset="UTF-8"`,
    `MIME-Version: 1.0`,
  ]
    .filter(Boolean)
    .join("\r\n");

  return `${headers}\r\n\r\n${parts.htmlBody}`;
}

async function fetchSignature(client: OAuth2Client): Promise<string> {
  try {
    const gmail = getGmail(client);
    const res = await gmail.users.settings.sendAs.list({ userId: "me" });
    const primary =
      res.data.sendAs?.find((s) => s.isPrimary) ?? res.data.sendAs?.[0];
    return primary?.signature ?? "";
  } catch {
    return "";
  }
}

export async function sendDecisionMail(
  client: OAuth2Client,
  input: ComposeInput & { to: string; cc: string[]; body?: string }
) {
  const composed = composeDecisionMail(input);
  const subject = composed.subject;
  // Honor a manager-edited body; fall back to the auto-composed text.
  const body = input.body?.trim() ? input.body : composed.body;
  const gmail = getGmail(client);
  const signature = await fetchSignature(client);

  const htmlBody =
    `<div>${escapeHtml(body).replace(/\n/g, "<br>")}</div>` +
    (signature ? `<br>${signature}` : "");

  let origMessageId = "";
  let replySubject = subject;
  try {
    const orig = await gmail.users.messages.get({
      userId: "me",
      id: input.request.id,
      format: "metadata",
      metadataHeaders: ["Message-ID", "Subject"],
    });
    const header = (name: string) =>
      orig.data.payload?.headers?.find(
        (h) => h.name?.toLowerCase() === name.toLowerCase()
      )?.value ?? "";
    origMessageId = header("Message-ID");
    const origSubject = header("Subject");
    if (origSubject) {
      replySubject = /^re:/i.test(origSubject)
        ? origSubject
        : `Re: ${origSubject}`;
    }
  } catch {
    origMessageId = "";
  }

  const raw = buildRawMessage({
    to: input.to,
    cc: input.cc,
    subject: replySubject,
    inReplyTo: origMessageId,
    htmlBody,
  });

  await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      raw: encodeMimeMessage(raw),
      threadId: input.request.threadId || undefined,
    },
  });

  return { subject, body };
}
