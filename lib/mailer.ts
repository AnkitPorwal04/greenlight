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
