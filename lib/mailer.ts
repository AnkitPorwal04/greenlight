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
  input: ComposeInput & { to: string; cc: string[] }
) {
  const { subject, body } = composeDecisionMail(input);
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

  const encodedSubject = /^[\x20-\x7e]*$/.test(replySubject)
    ? replySubject
    : `=?UTF-8?B?${Buffer.from(replySubject, "utf8").toString("base64")}?=`;

  const headers = [
    `To: ${input.to}`,
    input.cc.length ? `Cc: ${input.cc.join(", ")}` : null,
    `Subject: ${encodedSubject}`,
    origMessageId ? `In-Reply-To: ${origMessageId}` : null,
    origMessageId ? `References: ${origMessageId}` : null,
    `Content-Type: text/html; charset="UTF-8"`,
    `MIME-Version: 1.0`,
  ]
    .filter(Boolean)
    .join("\r\n");

  const raw = `${headers}\r\n\r\n${htmlBody}`;

  await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      raw: encodeMimeMessage(raw),
      threadId: input.request.threadId || undefined,
    },
  });

  return { subject, body };
}
