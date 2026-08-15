import { getJSON, setJSON } from "./storage";
import type { Decision } from "./types";

function decisionsKey(email: string) {
  return `decisions:${email.toLowerCase()}`;
}

function noAutoKey(email: string) {
  return `noauto:${email.toLowerCase()}`;
}

export async function loadNoAuto(email: string): Promise<string[]> {
  const list = await getJSON<string[]>(noAutoKey(email));
  return Array.isArray(list) ? list : [];
}

export async function loadDecisions(
  email: string
): Promise<Record<string, Decision>> {
  const key = decisionsKey(email);
  const own = (await getJSON<Record<string, Decision>>(key)) ?? {};
  const legacy = await getJSON<Record<string, Decision>>("decisions");
  if (!legacy || Object.keys(legacy).length === 0) return own;

  const merged = { ...legacy, ...own };
  for (const id of await loadNoAuto(email)) {
    if (!(id in own)) delete merged[id];
  }
  if (Object.keys(merged).some((id) => !(id in own))) {
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

// Used to roll back an optimistically-saved decision when the mail send fails,
// so the manager can safely retry without a duplicate being left behind.
export async function deleteDecision(
  email: string,
  messageId: string,
  options?: { suppressAuto?: boolean }
) {
  const all = await loadDecisions(email);
  if (messageId in all) {
    delete all[messageId];
    await setJSON(decisionsKey(email), all);
  }
  if (options?.suppressAuto) {
    const undone = await loadNoAuto(email);
    if (!undone.includes(messageId)) {
      await setJSON(noAutoKey(email), [...undone, messageId]);
    }
  }
}
