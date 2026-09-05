export const SYNC_STATE_VERSION = 1;

export const SYNC_MAX_AGE_MS = 15 * 60_000;

export const SYNC_SCOPES = ["leaves", "history", "calendar", "stats"] as const;

export type SyncScope = (typeof SYNC_SCOPES)[number];

export interface SyncState {
  v: number;
  historyId: string;
  sinceMs: number;
  count: number;
  at: number;
}

export type SyncReason =
  | "cold"
  | "no-history-id"
  | "window-moved"
  | "max-age"
  | "cache-shrunk"
  | "unchanged"
  | "history-changed"
  | "messages-added"
  | "no-messages-added"
  | "stale-history-id";

export type SyncAction = "scan" | "skip" | "probe";

export interface SyncPlan {
  action: SyncAction;
  reason: SyncReason;
}

export interface SyncInput {
  historyId: string;
  sinceMs: number;
  nowMs: number;
  cachedCount: number;
  maxAgeMs?: number;
}

export interface SyncOutcome {
  scan: boolean;
  reason: SyncReason;
}

export interface HistoryProbeRecord {
  messagesAdded?: unknown[] | null;
  labelsAdded?: unknown[] | null;
}

export interface HistoryProbeResponse {
  history?: HistoryProbeRecord[] | null;
  historyId?: string | null;
  nextPageToken?: string | null;
}

export type HistoryProbe = (
  startHistoryId: string
) => Promise<HistoryProbeResponse | null>;

export interface ScanCompletion {
  exhausted: boolean;
  capped: boolean;
  ids: string[];
  cached: Record<string, unknown>;
}

export interface CommitInput extends ScanCompletion {
  scanned: boolean;
  skipped: boolean;
  historyId: string;
  sinceMs: number;
  nowMs: number;
  previous: SyncState | null;
}

export function normalizeHistoryId(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

export function readSyncState(raw: unknown): SyncState | null {
  if (!raw || typeof raw !== "object") return null;
  const blob = raw as Partial<SyncState>;
  if (blob.v !== SYNC_STATE_VERSION) return null;

  const historyId = normalizeHistoryId(blob.historyId);
  if (!historyId) return null;
  if (typeof blob.sinceMs !== "number" || !Number.isFinite(blob.sinceMs)) {
    return null;
  }
  if (
    typeof blob.count !== "number" ||
    !Number.isFinite(blob.count) ||
    blob.count < 0
  ) {
    return null;
  }
  if (typeof blob.at !== "number" || !Number.isFinite(blob.at)) return null;

  return {
    v: SYNC_STATE_VERSION,
    historyId,
    sinceMs: blob.sinceMs,
    count: Math.floor(blob.count),
    at: blob.at,
  };
}

export function maxAgeFor(maxAgeMs: number | undefined): number {
  return typeof maxAgeMs === "number" && Number.isFinite(maxAgeMs) && maxAgeMs >= 0
    ? maxAgeMs
    : SYNC_MAX_AGE_MS;
}

export function planSync(
  state: SyncState | null,
  input: SyncInput
): SyncPlan {
  const historyId = normalizeHistoryId(input.historyId);
  if (!historyId) return { action: "scan", reason: "no-history-id" };
  if (!state) return { action: "scan", reason: "cold" };
  if (state.sinceMs !== input.sinceMs) {
    return { action: "scan", reason: "window-moved" };
  }

  const age = input.nowMs - state.at;
  if (!(age >= 0) || age >= maxAgeFor(input.maxAgeMs)) {
    return { action: "scan", reason: "max-age" };
  }

  if (!(input.cachedCount >= state.count)) {
    return { action: "scan", reason: "cache-shrunk" };
  }

  if (state.historyId === historyId) {
    return { action: "skip", reason: "unchanged" };
  }
  return { action: "probe", reason: "history-changed" };
}

export function probeSaysChanged(
  res: HistoryProbeResponse | null | undefined
): boolean {
  if (!res || typeof res !== "object") return true;

  const more = res.nextPageToken;
  if (typeof more === "string" && more.trim() !== "") return true;

  const records = Array.isArray(res.history) ? res.history : [];
  return records.some(
    (record) =>
      Array.isArray(record?.messagesAdded) && record.messagesAdded.length > 0
  );
}

export function isStaleHistoryId(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as {
    status?: unknown;
    code?: unknown;
    response?: { status?: unknown } | null;
  };
  const status = e.response?.status ?? e.status ?? e.code;
  return status === 404 || status === "404";
}

export async function decideSync(
  state: SyncState | null,
  input: SyncInput,
  probe: HistoryProbe
): Promise<SyncOutcome> {
  const plan = planSync(state, input);
  if (plan.action !== "probe" || !state) {
    return { scan: plan.action !== "skip", reason: plan.reason };
  }

  try {
    const res = await probe(state.historyId);
    return probeSaysChanged(res)
      ? { scan: true, reason: "messages-added" }
      : { scan: false, reason: "no-messages-added" };
  } catch (err) {
    if (!isStaleHistoryId(err)) throw err;
    return { scan: true, reason: "stale-history-id" };
  }
}

export function scanIsComplete(input: ScanCompletion): boolean {
  if (input.exhausted || input.capped) return false;
  const cached = input.cached ?? {};
  return input.ids.every((id) => Boolean(cached[id]));
}

export function nextSyncState(
  historyId: string,
  sinceMs: number,
  count: number,
  nowMs: number
): SyncState | null {
  const id = normalizeHistoryId(historyId);
  if (!id) return null;
  if (!Number.isFinite(sinceMs) || !Number.isFinite(nowMs)) return null;
  return {
    v: SYNC_STATE_VERSION,
    historyId: id,
    sinceMs,
    count: Math.max(0, Math.floor(count)),
    at: nowMs,
  };
}

export function advanceSyncState(
  state: SyncState | null,
  historyId: string
): SyncState | null {
  if (!state) return null;
  const id = normalizeHistoryId(historyId);
  if (!id || id === state.historyId) return null;
  return { ...state, historyId: id };
}

export function syncStateToStore(input: CommitInput): SyncState | null {
  if (input.skipped) return null;
  if (!input.scanned) return advanceSyncState(input.previous, input.historyId);
  if (!scanIsComplete(input)) return null;
  return nextSyncState(
    input.historyId,
    input.sinceMs,
    input.ids.length,
    input.nowMs
  );
}
