import { getJSON, setJSON } from "./storage";
import type { Decision } from "./types";

function decisionsKey(email: string) {
  return `decisions:${email.toLowerCase()}`;
}

export async function loadDecisions(
  email: string
): Promise<Record<string, Decision>> {
  return (
    (await getJSON<Record<string, Decision>>(decisionsKey(email))) ?? {}
  );
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
