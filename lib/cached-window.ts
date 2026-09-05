export interface TimedEntry {
  t: number;
}

export function cachedIdsSince(
  entries: Record<string, TimedEntry>,
  sinceMs: number,
  cap = Infinity
): string[] {
  const rows: { id: string; t: number }[] = [];
  for (const [id, entry] of Object.entries(entries ?? {})) {
    if (!id || !entry || typeof entry.t !== "number") continue;
    if (!Number.isFinite(entry.t)) continue;
    if (entry.t < sinceMs) continue;
    rows.push({ id, t: entry.t });
  }
  rows.sort((a, b) => b.t - a.t || a.id.localeCompare(b.id));
  const limit = Number.isFinite(cap) ? Math.max(0, cap) : rows.length;
  return rows.slice(0, limit).map((row) => row.id);
}
