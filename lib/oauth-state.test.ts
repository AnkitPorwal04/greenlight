import { describe, it, expect, afterEach, vi } from "vitest";
import {
  OAUTH_STATE_COOKIE,
  OAUTH_STATE_MAX_AGE_SECONDS,
  createOAuthState,
  oauthStateCookieOptions,
  oauthStateMatches,
} from "./oauth-state";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("createOAuthState", () => {
  it("returns 64 hex characters", () => {
    expect(createOAuthState()).toMatch(/^[0-9a-f]{64}$/);
  });

  it("returns a different value on every call", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 50; i += 1) seen.add(createOAuthState());
    expect(seen.size).toBe(50);
  });
});

describe("oauthStateMatches", () => {
  it("accepts a state that round-trips unchanged", () => {
    const state = createOAuthState();
    expect(oauthStateMatches(state, state)).toBe(true);
  });

  it("rejects a state of the same length that differs", () => {
    const state = createOAuthState();
    const forged = (state[0] === "a" ? "b" : "a") + state.slice(1);
    expect(oauthStateMatches(forged, state)).toBe(false);
  });

  it("rejects a state that differs only in the last character", () => {
    const stored = "a".repeat(63) + "b";
    const received = "a".repeat(63) + "c";
    expect(oauthStateMatches(received, stored)).toBe(false);
  });

  it("rejects a shorter received state without throwing", () => {
    const state = createOAuthState();
    expect(oauthStateMatches(state.slice(0, 32), state)).toBe(false);
  });

  it("rejects a longer received state without throwing", () => {
    const state = createOAuthState();
    expect(oauthStateMatches(state + "00", state)).toBe(false);
  });

  it("rejects a prefix of the stored state", () => {
    expect(oauthStateMatches("abc", "abcdef")).toBe(false);
  });

  it("rejects when the received state is missing", () => {
    const state = createOAuthState();
    expect(oauthStateMatches(null, state)).toBe(false);
    expect(oauthStateMatches(undefined, state)).toBe(false);
    expect(oauthStateMatches("", state)).toBe(false);
  });

  it("rejects when the stored cookie is missing", () => {
    const state = createOAuthState();
    expect(oauthStateMatches(state, null)).toBe(false);
    expect(oauthStateMatches(state, undefined)).toBe(false);
    expect(oauthStateMatches(state, "")).toBe(false);
  });

  it("rejects when both sides are missing", () => {
    expect(oauthStateMatches("", "")).toBe(false);
    expect(oauthStateMatches(null, null)).toBe(false);
    expect(oauthStateMatches(undefined, undefined)).toBe(false);
  });

  it("treats state as opaque and case sensitive", () => {
    expect(oauthStateMatches("ABCDEF", "abcdef")).toBe(false);
  });

  it("does not trim surrounding whitespace", () => {
    expect(oauthStateMatches(" abcdef", "abcdef")).toBe(false);
    expect(oauthStateMatches("abcdef ", "abcdef")).toBe(false);
  });
});

describe("oauthStateCookieOptions", () => {
  it("is httpOnly, lax and scoped to the whole site", () => {
    const options = oauthStateCookieOptions(OAUTH_STATE_MAX_AGE_SECONDS);
    expect(options.httpOnly).toBe(true);
    expect(options.sameSite).toBe("lax");
    expect(options.path).toBe("/");
  });

  it("survives only a short round trip to Google", () => {
    expect(OAUTH_STATE_MAX_AGE_SECONDS).toBe(600);
    expect(oauthStateCookieOptions(OAUTH_STATE_MAX_AGE_SECONDS).maxAge).toBe(
      600
    );
  });

  it("passes a zero max age through so the cookie can be cleared", () => {
    expect(oauthStateCookieOptions(0).maxAge).toBe(0);
  });

  it("is secure in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(oauthStateCookieOptions(600).secure).toBe(true);
  });

  it("is not secure outside production so local http still works", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(oauthStateCookieOptions(600).secure).toBe(false);
  });

  it("uses a namespaced cookie name", () => {
    expect(OAUTH_STATE_COOKIE).toBe("gl_oauth_state");
  });
});
