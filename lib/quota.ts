import { incrBy } from "./storage";

export const GMAIL_UNIT_COST = {
  "messages.get": 20,
  "messages.list": 5,
  "messages.send": 100,
  "threads.get": 40,
  "threads.list": 10,
  "history.list": 2,
  getProfile: 1,
  "settings.sendAs.list": 1,
} as const;

export type GmailMethod = keyof typeof GMAIL_UNIT_COST;

export const GMAIL_BUDGET_UNITS = 5200;

export const QUOTA_WINDOW_MS = 60_000;

export interface Reservation {
  allowed: boolean;
  remaining: number;
  resetAtMs: number;
  degraded: boolean;
}

export interface QuotaLedger {
  afford(method: GmailMethod, count?: number): Promise<boolean>;
  charge(method: GmailMethod, count?: number): Promise<void>;
  readonly spent: number;
  readonly exhausted: boolean;
  readonly degraded: boolean;
  readonly resetAtMs: number;
}

export function budgetUnits(
  env: Record<string, string | undefined> = process.env
): number {
  const raw = env.GMAIL_UNITS_PER_MINUTE;
  if (raw === undefined || raw === null || String(raw).trim() === "") {
    return GMAIL_BUDGET_UNITS;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return GMAIL_BUDGET_UNITS;
  return Math.floor(parsed);
}

export function unitsFor(method: GmailMethod, count = 1): number {
  if (!Number.isFinite(count) || count <= 0) return 0;
  return GMAIL_UNIT_COST[method] * Math.floor(count);
}

export function quotaWindow(nowMs: number): number {
  return Math.floor(nowMs / QUOTA_WINDOW_MS);
}

export function quotaKey(email: string, nowMs: number): string {
  return `gq:${email.trim().toLowerCase()}:${quotaWindow(nowMs)}`;
}

export function windowResetAt(nowMs: number): number {
  return (quotaWindow(nowMs) + 1) * QUOTA_WINDOW_MS;
}

interface LocalWindow {
  window: number;
  used: number;
}

const localWindows = new Map<string, LocalWindow>();

function localAdd(email: string, units: number, nowMs: number): number {
  const id = email.trim().toLowerCase();
  const window = quotaWindow(nowMs);
  const current = localWindows.get(id);
  const used = current && current.window === window ? current.used : 0;
  const total = Math.max(0, used + units);
  localWindows.set(id, { window, used: total });
  return total;
}

export async function reserveUnits(
  email: string,
  units: number,
  nowMs: number = Date.now()
): Promise<Reservation> {
  const budget = budgetUnits();
  const resetAtMs = windowResetAt(nowMs);

  if (!Number.isFinite(units) || units <= 0) {
    return { allowed: true, remaining: budget, resetAtMs, degraded: false };
  }

  const key = quotaKey(email, nowMs);
  const ttlSeconds = Math.max(1, Math.ceil((resetAtMs - nowMs) / 1000));

  const shadow = localAdd(email, units, nowMs);
  const stored = await incrBy(key, units, ttlSeconds).catch(() => null);

  const degraded = stored === null;
  const total = degraded ? shadow : stored;

  if (total > budget) {
    if (!degraded) await incrBy(key, -units, ttlSeconds).catch(() => 0);
    localAdd(email, -units, nowMs);
    return {
      allowed: false,
      remaining: Math.max(0, budget - (total - units)),
      resetAtMs,
      degraded,
    };
  }

  return {
    allowed: true,
    remaining: Math.max(0, budget - total),
    resetAtMs,
    degraded,
  };
}

export function createLedger(
  email: string,
  now: () => number = Date.now
): QuotaLedger {
  let spent = 0;
  let exhausted = false;
  let degraded = false;
  let resetAtMs = windowResetAt(now());

  return {
    async afford(method: GmailMethod, count = 1): Promise<boolean> {
      const units = unitsFor(method, count);
      if (units <= 0) return true;
      if (exhausted) return false;

      const reservation = await reserveUnits(email, units, now());
      resetAtMs = reservation.resetAtMs;
      if (reservation.degraded) degraded = true;

      if (!reservation.allowed) {
        exhausted = true;
        return false;
      }
      spent += units;
      return true;
    },
    async charge(method: GmailMethod, count = 1): Promise<void> {
      const units = unitsFor(method, count);
      if (units <= 0) return;

      const reservation = await reserveUnits(email, units, now());
      resetAtMs = reservation.resetAtMs;
      if (reservation.degraded) degraded = true;
      spent += units;
    },
    get spent() {
      return spent;
    },
    get exhausted() {
      return exhausted;
    },
    get degraded() {
      return degraded;
    },
    get resetAtMs() {
      return resetAtMs;
    },
  };
}
