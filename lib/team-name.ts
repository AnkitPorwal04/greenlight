export const DEFAULT_TEAM_NAME = "My Team";

export const TEAM_NAME_MAX_LENGTH = 40;

export interface DirectoryEntry {
  name?: string;
  email?: string;
}

export interface Manager {
  name: string;
  email: string;
}

export function normalizeTeamName(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, TEAM_NAME_MAX_LENGTH)
    .trim();
}

export function teamNameOrDefault(value: unknown): string {
  return normalizeTeamName(value) || DEFAULT_TEAM_NAME;
}

export function prettifyEmailName(email: unknown): string {
  const raw = typeof email === "string" ? email.trim() : "";
  if (!raw) return "";
  const words = raw
    .split("@")[0]
    .split(/[._+\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase());
  return words.length > 0 ? words.join(" ") : raw;
}

export function managerDisplayName(
  email: unknown,
  people: DirectoryEntry[]
): string {
  const target = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (!target) return "";
  for (const person of Array.isArray(people) ? people : []) {
    const candidate =
      typeof person?.email === "string" ? person.email.trim().toLowerCase() : "";
    if (!candidate || candidate !== target) continue;
    const name = typeof person?.name === "string" ? person.name.trim() : "";
    if (name) return name;
  }
  return prettifyEmailName(target);
}

export function initialsFromName(name: unknown): string {
  const words = (typeof name === "string" ? name.trim() : "")
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return "";
  const first = words[0].charAt(0);
  const last = words.length > 1 ? words[words.length - 1].charAt(0) : "";
  return `${first}${last}`.toUpperCase();
}
