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

  const headers = [
    `To: ${input.to}`,
    input.cc.length ? `Cc: ${input.cc.join(", ")}` : null,
    `Subject: ${subject}`,
    `Content-Type: text/html; charset="UTF-8"`,
    `MIME-Version: 1.0`,
  ]
    .filter(Boolean)
    .join("\r\n");

  const raw = `${headers}\r\n\r\n${htmlBody}`;

  await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw: encodeMimeMessage(raw) },
  });

  return { subject, body };
}
