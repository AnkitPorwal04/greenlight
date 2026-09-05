export interface TimedEntry {
  t: number;
  m?: { threadId?: string } | null;
}

export interface WindowRef {
  id: string;
  threadId?: string;
}

export interface WindowRefsInput {
  scan: boolean;
  degraded: boolean;
  listed: readonly WindowRef[];
  cachedIds: readonly string[];
  entries: Record<string, TimedEntry>;
  cap?: number;
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

function cachedThreadId(
  entries: Record<string, TimedEntry>,
  id: string
): string | undefined {
  return entries?.[id]?.m?.threadId;
}

function cachedTime(
  entries: Record<string, TimedEntry>,
  id: string
): number | null {
  const t = entries?.[id]?.t;
  if (typeof t !== "number" || !Number.isFinite(t)) return null;
  return t;
}

export function resolveWindowRefs(input: WindowRefsInput): WindowRef[] {
  const { scan, degraded, listed, cachedIds, entries, cap = Infinity } = input;
  const source = entries ?? {};

  if (!scan) {
    return [...(cachedIds ?? [])].map((id) => ({
      id,
      threadId: cachedThreadId(source, id),
    }));
  }

  const refs = [...(listed ?? [])];
  if (!degraded) return refs;

  const seen = new Set<string>();
  const merged: WindowRef[] = [];
  for (const ref of refs) {
    if (!ref?.id || seen.has(ref.id)) continue;
    seen.add(ref.id);
    merged.push({
      id: ref.id,
      threadId: ref.threadId ?? cachedThreadId(source, ref.id),
    });
  }
  for (const id of cachedIds ?? []) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    merged.push({ id, threadId: cachedThreadId(source, id) });
  }

  const rows = merged.map((ref, index) => ({
    ref,
    t: cachedTime(source, ref.id),
    index,
  }));
  rows.sort((a, b) => {
    if (a.t === null && b.t === null) return a.index - b.index;
    if (a.t === null) return -1;
    if (b.t === null) return 1;
    return b.t - a.t || a.ref.id.localeCompare(b.ref.id);
  });

  const limit = Number.isFinite(cap) ? Math.max(0, cap) : rows.length;
  return rows.slice(0, limit).map((row) => row.ref);
}
