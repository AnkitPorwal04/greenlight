import { getJSON, setJSON } from "./storage";
import type { Decision } from "./types";

function decisionsKey(email: string) {
  return `decisions:${email.toLowerCase()}`;
}

export async function loadDecisions(
  email: string
): Promise<Record<string, Decision>> {
  const key = decisionsKey(email);
  const own = await getJSON<Record<string, Decision>>(key);
  const legacy = await getJSON<Record<string, Decision>>("decisions");
  if (!legacy || Object.keys(legacy).length === 0) return own ?? {};
  const merged = { ...legacy, ...(own ?? {}) };
  if (Object.keys(merged).length !== Object.keys(own ?? {}).length) {
    await setJSON(key, merged);
  }
  return merged;
}

export async function saveDecision(
  email: string,
  messageId: string,
  decision: Decision
) {
  const all = await loadDecisions(email);
  all[messageId] = decision;
  await setJSON(decisionsKey(email), all);
}
