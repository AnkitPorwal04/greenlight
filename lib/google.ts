import { OAuth2Client, Credentials } from "google-auth-library";
import { gmail, gmail_v1 } from "@googleapis/gmail";
import { getJSON, setJSON, delKey } from "./storage";
import { readGmailLimit } from "./gmail-breaker";

function tokensKey(email: string) {
  return `gmail_tokens:${email.toLowerCase()}`;
}

export const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
];

export function getOAuthClient(origin?: string): OAuth2Client {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI ??
    (origin
      ? `${origin}/api/auth/callback`
      : "http://localhost:3000/api/auth/callback");

  if (!clientId || !clientSecret) {
    throw new Error(
      "Missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET. Add them to .env.local (see README)."
    );
  }
  return new OAuth2Client(clientId, clientSecret, redirectUri);
}

export async function saveTokens(email: string, tokens: Credentials) {
  // Merge because Google returns refresh_token only on the FIRST consent;
  // overwriting on later refreshes would silently destroy it
  const key = tokensKey(email);
  const existing = (await getJSON<Credentials>(key)) ?? {};
  await setJSON(key, { ...existing, ...tokens });
}

export async function clearTokens(email: string) {
  await delKey(tokensKey(email));
}

export async function getAuthorizedClient(
  email: string,
  origin?: string
): Promise<OAuth2Client | null> {
  const tokens = await getJSON<Credentials>(tokensKey(email));
  if (!tokens?.refresh_token && !tokens?.access_token) return null;
  const client = getOAuthClient(origin);
  client.setCredentials(tokens);
  client.on("tokens", (t) => {
    void saveTokens(email, t);
  });
  return client;
}

export const GMAIL_RETRY_TOTAL_TIMEOUT_MS = 20_000;
export const GMAIL_MAX_RETRY_DELAY_MS = 8_000;
export const GMAIL_RETRIES = 2;

export function shouldRetryGmail(err: unknown): boolean {
  const limit = readGmailLimit(err);
  if (!limit) return false;
  return limit.kind === "rate";
}

export function gmailRetryConfig() {
  return {
    retry: GMAIL_RETRIES,
    retryDelay: 250,
    retryDelayMultiplier: 2,
    maxRetryDelay: GMAIL_MAX_RETRY_DELAY_MS,
    totalTimeout: GMAIL_RETRY_TOTAL_TIMEOUT_MS,
    statusCodesToRetry: [
      [408, 408],
      [429, 429],
      [500, 599],
    ],
    shouldRetry(err: unknown) {
      const e = err as { config?: { retryConfig?: { currentRetryAttempt?: number } } };
      const attempt = e?.config?.retryConfig?.currentRetryAttempt ?? 0;
      if (attempt >= GMAIL_RETRIES) return false;

      const limit = readGmailLimit(err);
      if (limit) return limit.kind === "rate";

      const status = (err as { response?: { status?: number } })?.response
        ?.status;
      if (typeof status !== "number") return false;
      return status === 408 || status === 429 || (status >= 500 && status < 600);
    },
  };
}

export function getGmail(client: OAuth2Client): gmail_v1.Gmail {
  return gmail({
    version: "v1",
    auth: client,
    retryConfig: gmailRetryConfig(),
  });
}
