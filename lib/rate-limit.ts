import { getJSON, setJSON } from "./storage";

export interface RateLimitRule {
  limit: number;
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

interface WindowState {
  count: number;
  resetAt: number;
}

export const PASSCODE_ATTEMPTS: RateLimitRule = {
  limit: 10,
  windowMs: 15 * 60 * 1000,
};

export const REFETCH: RateLimitRule = {
  limit: 10,
  windowMs: 10 * 1000,
};

export function clientIp(req: {
  headers: { get(name: string): string | null };
}): string {
  const forwarded = req.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first || "unknown";
}

export function rateLimitKey(bucket: string, id: string): string {
  return `rl:${bucket}:${id}`;
}

export async function checkRateLimit(
  bucket: string,
  id: string,
  rule: RateLimitRule,
  now: number = Date.now()
): Promise<RateLimitResult> {
  const key = rateLimitKey(bucket, id);

  try {
    const stored = await getJSON<WindowState>(key);
    const open =
      stored &&
      typeof stored.count === "number" &&
      typeof stored.resetAt === "number" &&
      stored.resetAt > now
        ? stored
        : null;

    const resetAt = open ? open.resetAt : now + rule.windowMs;
    const count = (open?.count ?? 0) + 1;
    const retryAfterSeconds = Math.max(1, Math.ceil((resetAt - now) / 1000));

    if (count > rule.limit) {
      return { allowed: false, remaining: 0, retryAfterSeconds };
    }

    await setJSON(key, { count, resetAt }, retryAfterSeconds);
    return {
      allowed: true,
      remaining: rule.limit - count,
      retryAfterSeconds,
    };
  } catch {
    return { allowed: true, remaining: rule.limit, retryAfterSeconds: 0 };
  }
}
