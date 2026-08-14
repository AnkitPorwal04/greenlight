import { getJSON, setJSON } from "./storage";
import type { Decision } from "./types";

const DECISIONS_KEY = "decisions";

export async function loadDecisions(): Promise<Record<string, Decision>> {
  return (await getJSON<Record<string, Decision>>(DECISIONS_KEY)) ?? {};
}

export async function saveDecision(messageId: string, decision: Decision) {
  const all = await loadDecisions();
  all[messageId] = decision;
  await setJSON(DECISIONS_KEY, all);
}
