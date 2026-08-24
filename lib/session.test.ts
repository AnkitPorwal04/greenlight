import { describe, it, expect, afterEach, vi } from "vitest";
import { signUser, verifyUser } from "./session";

const LONG_SECRET = "s".repeat(40);
const OTHER_SECRET = "z".repeat(40);

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("signUser / verifyUser", () => {
  it("round-trips an email", () => {
    vi.stubEnv("SESSION_SECRET", LONG_SECRET);
    const cookie = signUser("ankit.porwal@ethara.ai");
    expect(verifyUser(cookie)).toBe("ankit.porwal@ethara.ai");
  });

  it("normalizes case and whitespace when signing", () => {
    vi.stubEnv("SESSION_SECRET", LONG_SECRET);
    const cookie = signUser("  Ankit.Porwal@Ethara.AI  ");
    expect(verifyUser(cookie)).toBe("ankit.porwal@ethara.ai");
  });

  it("rejects a tampered email", () => {
    vi.stubEnv("SESSION_SECRET", LONG_SECRET);
    const cookie = signUser("ankit.porwal@ethara.ai");
    const hmac = cookie.slice(cookie.lastIndexOf(".") + 1);
    expect(verifyUser(`attacker@ethara.ai.${hmac}`)).toBeNull();
  });

  it("rejects a tampered hmac", () => {
    vi.stubEnv("SESSION_SECRET", LONG_SECRET);
    const cookie = signUser("ankit.porwal@ethara.ai");
    const sep = cookie.lastIndexOf(".");
    const email = cookie.slice(0, sep);
    const hmac = cookie.slice(sep + 1);
    const flipped = (hmac[0] === "a" ? "b" : "a") + hmac.slice(1);
    expect(verifyUser(`${email}.${flipped}`)).toBeNull();
  });

  it("rejects an hmac of the wrong length", () => {
    vi.stubEnv("SESSION_SECRET", LONG_SECRET);
    const cookie = signUser("ankit.porwal@ethara.ai");
    expect(verifyUser(cookie.slice(0, cookie.length - 2))).toBeNull();
  });

  it("rejects a value with no separator", () => {
    vi.stubEnv("SESSION_SECRET", LONG_SECRET);
    expect(verifyUser("ankit-porwal-at-ethara-ai")).toBeNull();
  });

  it("rejects empty and missing values", () => {
    vi.stubEnv("SESSION_SECRET", LONG_SECRET);
    expect(verifyUser("")).toBeNull();
    expect(verifyUser(null)).toBeNull();
    expect(verifyUser(undefined)).toBeNull();
    expect(verifyUser(".abc")).toBeNull();
    expect(verifyUser("ankit@ethara.ai.")).toBeNull();
  });

  it("rejects a cookie signed under a different secret", () => {
    vi.stubEnv("SESSION_SECRET", OTHER_SECRET);
    const forged = signUser("ankit.porwal@ethara.ai");
    vi.stubEnv("SESSION_SECRET", LONG_SECRET);
    expect(verifyUser(forged)).toBeNull();
  });

  it("no longer trusts a cookie signed with the shared passcode", () => {
    vi.stubEnv("SESSION_SECRET", "");
    vi.stubEnv("APP_PASSCODE", "the-shared-passcode");
    const forged = signUser("victim@ethara.ai");
    vi.stubEnv("SESSION_SECRET", LONG_SECRET);
    expect(verifyUser(forged)).toBeNull();
  });

  it("falls back to the dev secret outside production", () => {
    vi.stubEnv("SESSION_SECRET", "");
    vi.stubEnv("APP_PASSCODE", "the-shared-passcode");
    const first = signUser("ankit.porwal@ethara.ai");
    vi.stubEnv("APP_PASSCODE", "a-different-passcode");
    expect(verifyUser(first)).toBe("ankit.porwal@ethara.ai");
  });
});
