import { getJSON, setJSON } from "./storage";

export const RATE_LIMIT_REASONS = new Set([
  "rateLimitExceeded",
  "userRateLimitExceeded",
]);

export const HARD_LIMIT_REASONS = new Set(["dailyLimitExceeded"]);

export const DEFAULT_COOLDOWN_MS = 60_000;

export const HARD_LIMIT_COOLDOWN_MS = 30 * 60_000;

export const MAX_COOLDOWN_MS = 60 * 60_000;

export type GmailLimitKind = "rate" | "hard";

export interface GmailLimit {
  kind: GmailLimitKind;
  reason: string;
  retryAfterMs: number | null;
}

export interface BreakerState {
  retryAt: number;
  detectedAt: number;
  reason: string;
  kind: GmailLimitKind;
}

interface GaxiosLike {
  response?: {
    status?: number;
    headers?: unknown;
    data?: {
      error?: {
        errors?: { reason?: string }[];
      };
    };
  };
  status?: number;
  code?: number | string;
}

function headerValue(headers: unknown, name: string): string | null {
  if (!headers) return null;

  if (typeof (headers as Headers).get === "function") {
    const found = (headers as Headers).get(name);
    return typeof found === "string" ? found : null;
  }

  const bag = headers as Record<string, unknown>;
  for (const key of Object.keys(bag)) {
    if (key.toLowerCase() !== name.toLowerCase()) continue;
    const found = bag[key];
    if (typeof found === "string") return found;
    if (Array.isArray(found) && typeof found[0] === "string") return found[0];
  }
  return null;
}

export function parseRetryAfter(
  value: string | null | undefined,
  nowMs: number
): number | null {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  if (/^\d+$/.test(raw)) {
    const seconds = Number(raw);
    if (!Number.isFinite(seconds) || seconds < 0) return null;
    return Math.min(seconds * 1000, MAX_COOLDOWN_MS);
  }

  const at = Date.parse(raw);
  if (Number.isNaN(at)) return null;
  return Math.min(Math.max(0, at - nowMs), MAX_COOLDOWN_MS);
}

export function readGmailLimit(
  err: unknown,
  nowMs: number = Date.now()
): GmailLimit | null {
  if (!err || typeof err !== "object") return null;
  const e = err as GaxiosLike;

  const status = e.response?.status ?? e.status;
  const reasons = (e.response?.data?.error?.errors ?? [])
    .map((row) => (typeof row?.reason === "string" ? row.reason : ""))
    .filter(Boolean);

  const retryAfterMs = parseRetryAfter(
    headerValue(e.response?.headers, "retry-after"),
    nowMs
  );

  if (status === 403) {
    const hard = reasons.find((reason) => HARD_LIMIT_REASONS.has(reason));
    if (hard) return { kind: "hard", reason: hard, retryAfterMs };

    const soft = reasons.find((reason) => RATE_LIMIT_REASONS.has(reason));
    if (soft) return { kind: "rate", reason: soft, retryAfterMs };
    return null;
  }

  if (status === 429) {
    const hard = reasons.find((reason) => HARD_LIMIT_REASONS.has(reason));
    if (hard) return { kind: "hard", reason: hard, retryAfterMs };
    return { kind: "rate", reason: reasons[0] ?? "rateLimitExceeded", retryAfterMs };
  }

  return null;
}

export function isGmailRateLimit(err: unknown): boolean {
  return readGmailLimit(err)?.kind === "rate";
}

export function cooldownFor(limit: GmailLimit): number {
  if (limit.retryAfterMs !== null && limit.retryAfterMs > 0) {
    return Math.min(limit.retryAfterMs, MAX_COOLDOWN_MS);
  }
  return limit.kind === "hard" ? HARD_LIMIT_COOLDOWN_MS : DEFAULT_COOLDOWN_MS;
}

export function breakerKey(email: string): string {
  return `gbrk:${email.trim().toLowerCase()}`;
}

export function stateFrom(limit: GmailLimit, nowMs: number): BreakerState {
  return {
    retryAt: nowMs + cooldownFor(limit),
    detectedAt: nowMs,
    reason: limit.reason,
    kind: limit.kind,
  };
}

export function isOpen(
  state: BreakerState | null,
  nowMs: number = Date.now()
): boolean {
  if (!state || typeof state.retryAt !== "number") return false;
  return state.retryAt > nowMs;
}

export async function readBreaker(
  email: string,
  nowMs: number = Date.now()
): Promise<BreakerState | null> {
  const stored = await getJSON<BreakerState>(breakerKey(email)).catch(
    () => null
  );
  return isOpen(stored, nowMs) ? stored : null;
}

export async function tripBreaker(
  email: string,
  limit: GmailLimit,
  nowMs: number = Date.now()
): Promise<BreakerState> {
  const state = stateFrom(limit, nowMs);
  const ttlSeconds = Math.max(1, Math.ceil((state.retryAt - nowMs) / 1000));
  await setJSON(breakerKey(email), state, ttlSeconds).catch(() => undefined);
  return state;
}

export async function noteGmailFailure(
  email: string,
  err: unknown,
  nowMs: number = Date.now()
): Promise<BreakerState | null> {
  const limit = readGmailLimit(err, nowMs);
  if (!limit) return null;
  return tripBreaker(email, limit, nowMs);
}
