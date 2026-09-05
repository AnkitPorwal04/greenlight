import { describe, expect, it } from "vitest";
import {
  GMAIL_MAX_RETRY_DELAY_MS,
  GMAIL_RETRIES,
  GMAIL_RETRY_TOTAL_TIMEOUT_MS,
  gmailRetryConfig,
  shouldRetryGmail,
} from "./google";

const MAX_DURATION_MS = 60_000;

function err(status: number, reason?: string, attempt = 0) {
  return {
    config: { retryConfig: { currentRetryAttempt: attempt } },
    response: {
      status,
      headers: {},
      data: reason ? { error: { errors: [{ reason }] } } : undefined,
    },
  };
}

describe("gmailRetryConfig", () => {
  it("bounds the whole retry sequence well inside maxDuration = 60", () => {
    const config = gmailRetryConfig();
    expect(config.totalTimeout).toBe(GMAIL_RETRY_TOTAL_TIMEOUT_MS);
    expect(config.totalTimeout).toBeLessThan(MAX_DURATION_MS);
    expect(config.maxRetryDelay).toBe(GMAIL_MAX_RETRY_DELAY_MS);
    expect(config.maxRetryDelay).toBeLessThan(config.totalTimeout);
  });

  it("replaces the gaxios defaults that were effectively unbounded", () => {
    const config = gmailRetryConfig();
    expect(config.totalTimeout).not.toBe(Number.MAX_SAFE_INTEGER);
    expect(config.maxRetryDelay).not.toBe(Number.MAX_SAFE_INTEGER);
    expect(config.retry).toBe(GMAIL_RETRIES);
    expect(config.retry).toBeLessThan(3);
  });

  it("opts in to the 403 rate-limit reasons gaxios would not retry", () => {
    const config = gmailRetryConfig();
    expect(config.shouldRetry(err(403, "rateLimitExceeded"))).toBe(true);
    expect(config.shouldRetry(err(403, "userRateLimitExceeded"))).toBe(true);
  });

  it("never retries the hard daily limit that backoff cannot fix", () => {
    const config = gmailRetryConfig();
    expect(config.shouldRetry(err(403, "dailyLimitExceeded"))).toBe(false);
    expect(config.shouldRetry(err(429, "dailyLimitExceeded"))).toBe(false);
  });

  it("leaves ordinary 403s alone", () => {
    const config = gmailRetryConfig();
    expect(config.shouldRetry(err(403, "insufficientPermissions"))).toBe(false);
    expect(config.shouldRetry(err(403))).toBe(false);
  });

  it("still retries the transient statuses", () => {
    const config = gmailRetryConfig();
    expect(config.shouldRetry(err(429))).toBe(true);
    expect(config.shouldRetry(err(500))).toBe(true);
    expect(config.shouldRetry(err(503))).toBe(true);
    expect(config.shouldRetry(err(408))).toBe(true);
  });

  it("does not retry client mistakes", () => {
    const config = gmailRetryConfig();
    expect(config.shouldRetry(err(404))).toBe(false);
    expect(config.shouldRetry(err(400))).toBe(false);
    expect(config.shouldRetry({})).toBe(false);
  });

  it("gives up once the attempts are used, including for 403 rate limits", () => {
    const config = gmailRetryConfig();
    expect(config.shouldRetry(err(429, undefined, GMAIL_RETRIES))).toBe(false);
    expect(
      config.shouldRetry(err(403, "userRateLimitExceeded", GMAIL_RETRIES))
    ).toBe(false);
    expect(config.shouldRetry(err(429, undefined, GMAIL_RETRIES - 1))).toBe(
      true
    );
  });

  it("keeps the worst-case backoff inside the budget", () => {
    const config = gmailRetryConfig();
    let worst = 0;
    for (let attempt = 0; attempt < GMAIL_RETRIES; attempt += 1) {
      const base = attempt === 0 ? config.retryDelay : 0;
      const calculated =
        base +
        ((Math.pow(config.retryDelayMultiplier, attempt) - 1) / 2) * 1000;
      worst += Math.min(calculated, config.maxRetryDelay);
    }
    expect(worst).toBeLessThan(config.totalTimeout);
    expect(worst).toBeLessThan(MAX_DURATION_MS / 2);
  });
});

describe("shouldRetryGmail", () => {
  it("agrees with the breaker about what counts as a rate limit", () => {
    expect(shouldRetryGmail(err(429))).toBe(true);
    expect(shouldRetryGmail(err(403, "userRateLimitExceeded"))).toBe(true);
    expect(shouldRetryGmail(err(403, "dailyLimitExceeded"))).toBe(false);
    expect(shouldRetryGmail(err(500))).toBe(false);
  });
});
