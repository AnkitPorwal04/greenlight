import { OAuth2Client, Credentials } from "google-auth-library";
import { gmail, gmail_v1 } from "@googleapis/gmail";
import { getJSON, setJSON, delKey } from "./storage";

const TOKENS_KEY = "gmail_tokens";

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

export async function saveTokens(tokens: Credentials) {
  // Merge because Google returns refresh_token only on the FIRST consent;
  // overwriting on later refreshes would silently destroy it
  const existing = (await getJSON<Credentials>(TOKENS_KEY)) ?? {};
  await setJSON(TOKENS_KEY, { ...existing, ...tokens });
}

export async function clearTokens() {
  await delKey(TOKENS_KEY);
}

export async function getAuthorizedClient(
  origin?: string
): Promise<OAuth2Client | null> {
  const tokens = await getJSON<Credentials>(TOKENS_KEY);
  if (!tokens?.refresh_token && !tokens?.access_token) return null;
  const client = getOAuthClient(origin);
  client.setCredentials(tokens);
  client.on("tokens", (t) => {
    void saveTokens(t);
  });
  return client;
}

export function getGmail(client: OAuth2Client): gmail_v1.Gmail {
  return gmail({ version: "v1", auth: client });
}
