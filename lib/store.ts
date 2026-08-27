import { delKey, getJSON, setJSON } from "./storage";
import { normalizeTeamName } from "./team-name";
import type { DirectClassification } from "./classify";
import type { Decision } from "./types";

export const CLASSIFICATION_TTL_SECONDS = 60 * 24 * 60 * 60;
export const MAX_DISMISSED = 500;

function decisionsKey(email: string) {
  return `decisions:${email.toLowerCase()}`;
}

function noAutoKey(email: string) {
  return `noauto:${email.toLowerCase()}`;
}

function teamKey(email: string) {
  return `team:${email.toLowerCase()}`;
}

function teamNameKey(email: string) {
  return `teamname:${email.toLowerCase()}`;
}

function classificationKey(email: string, messageId: string) {
  return `clf:${email.toLowerCase()}:${messageId}`;
}

function dismissedKey(email: string) {
  return `dismissed:${email.toLowerCase()}`;
}

export function trimDismissed(ids: string[]): string[] {
  const clean = (Array.isArray(ids) ? ids : [])
    .map((id) => String(id ?? "").trim())
    .filter(Boolean);
  const newestFirst = [...clean].reverse();
  const kept: string[] = [];
  const seen = new Set<string>();
  for (const id of newestFirst) {
    if (seen.has(id)) continue;
    seen.add(id);
    kept.push(id);
    if (kept.length >= MAX_DISMISSED) break;
  }
  return kept.reverse();
}

export async function loadDismissed(email: string): Promise<string[]> {
  const list = await getJSON<string[]>(dismissedKey(email));
  return trimDismissed(Array.isArray(list) ? list : []);
}

export async function saveDismissed(
  email: string,
  messageId: string
): Promise<void> {
  const existing = await loadDismissed(email);
  await setJSON(dismissedKey(email), trimDismissed([...existing, messageId]));
}

export async function loadClassification(
  email: string,
  messageId: string
): Promise<DirectClassification | null> {
  const stored = await getJSON<DirectClassification>(
    classificationKey(email, messageId)
  );
  if (!stored || typeof stored.isRequest !== "boolean") return null;
  return stored;
}

export async function saveClassification(
  email: string,
  messageId: string,
  classification: DirectClassification
): Promise<void> {
  await setJSON(
    classificationKey(email, messageId),
    classification,
    CLASSIFICATION_TTL_SECONDS
  );
}

// A manager's team is a per-user set of employee codes (uppercased). An empty
// list means "no team configured yet" — callers then show everyone, so the
// feature stays backward compatible until it is set up.
export async function loadTeam(email: string): Promise<string[]> {
  const list = await getJSON<string[]>(teamKey(email));
  return Array.isArray(list)
    ? list.map((c) => String(c).trim().toUpperCase()).filter(Boolean)
    : [];
}

export async function saveTeam(email: string, codes: string[]): Promise<void> {
  const clean = [
    ...new Set(
      (Array.isArray(codes) ? codes : [])
        .map((c) => String(c).trim().toUpperCase())
        .filter(Boolean)
    ),
  ];
  await setJSON(teamKey(email), clean);
}

export async function loadTeamName(email: string): Promise<string | null> {
  const stored = await getJSON<string>(teamNameKey(email));
  return normalizeTeamName(stored) || null;
}

export async function saveTeamName(
  email: string,
  name: string
): Promise<void> {
  const clean = normalizeTeamName(name);
  if (!clean) {
    await delKey(teamNameKey(email));
    return;
  }
  await setJSON(teamNameKey(email), clean);
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

export async function saveDecisions(
  email: string,
  messageIds: string[],
  decision: Decision
) {
  const all = await loadDecisions(email);
  for (const id of messageIds) all[id] = decision;
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
