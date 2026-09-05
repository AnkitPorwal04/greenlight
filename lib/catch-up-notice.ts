export const CATCH_UP_MESSAGE = "Catching up with Gmail. Some leave may be missing";

export function catchUpSuffix(
  retryAtMs: number | null,
  nowMs: number = Date.now()
): string {
  if (retryAtMs === null || !Number.isFinite(retryAtMs)) return ".";

  const seconds = Math.ceil((retryAtMs - nowMs) / 1000);
  if (seconds <= 0) return ". Refresh to try again.";
  if (seconds < 90) return `. Retrying in about ${seconds}s.`;

  const minutes = Math.ceil(seconds / 60);
  return `. Retrying in about ${minutes} min.`;
}
