import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { OAUTH_STATE_COOKIE } from "@/lib/oauth-state";

const saveTokens = vi.fn();
const getToken = vi.fn();
const getProfile = vi.fn();

vi.mock("@/lib/google", () => ({
  getOAuthClient: () => ({
    getToken,
    setCredentials: vi.fn(),
  }),
  getGmail: () => ({ users: { getProfile } }),
  saveTokens: (...args: unknown[]) => saveTokens(...args),
}));

const { GET } = await import("./route");

const STATE = "a".repeat(64);

function callbackRequest(params: Record<string, string>, cookie?: string) {
  const search = new URLSearchParams(params).toString();
  const req = new NextRequest(`https://greenlight.test/api/auth/callback?${search}`, {
    headers: cookie ? { cookie: `${OAUTH_STATE_COOKIE}=${cookie}` } : undefined,
  });
  return req;
}

function destination(res: Response): string {
  return new URL(res.headers.get("location") ?? "").search;
}

describe("the Google callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.ALLOWED_EMAILS;
    getToken.mockResolvedValue({ tokens: { access_token: "t" } });
    getProfile.mockResolvedValue({
      data: { emailAddress: "ankit@ethara.ai" },
    });
  });

  it("stores the mailbox when the round trip is intact", async () => {
    const res = await GET(callbackRequest({ code: "c", state: STATE }, STATE));

    expect(destination(res)).toBe("?auth=success");
    expect(saveTokens).toHaveBeenCalledWith("ankit@ethara.ai", {
      access_token: "t",
    });
  });

  it("never exchanges the code when the state does not match", async () => {
    const res = await GET(
      callbackRequest({ code: "c", state: STATE }, "b".repeat(64))
    );

    expect(destination(res)).toBe("?auth=error");
    expect(getToken).not.toHaveBeenCalled();
    expect(saveTokens).not.toHaveBeenCalled();
  });

  it("never exchanges the code when no state was stored", async () => {
    const res = await GET(callbackRequest({ code: "c", state: STATE }));

    expect(destination(res)).toBe("?auth=error");
    expect(getToken).not.toHaveBeenCalled();
    expect(saveTokens).not.toHaveBeenCalled();
  });

  it("never exchanges the code when Google returned no state", async () => {
    const res = await GET(callbackRequest({ code: "c" }, STATE));

    expect(destination(res)).toBe("?auth=error");
    expect(getToken).not.toHaveBeenCalled();
    expect(saveTokens).not.toHaveBeenCalled();
  });

  it("refuses to store a mailbox the owner has not allowed", async () => {
    process.env.ALLOWED_EMAILS = "archana@ethara.ai";

    const res = await GET(callbackRequest({ code: "c", state: STATE }, STATE));

    expect(destination(res)).toBe("?auth=forbidden");
    expect(saveTokens).not.toHaveBeenCalled();
  });

  it("stores a mailbox that is on the allowlist", async () => {
    process.env.ALLOWED_EMAILS = "  ANKIT@Ethara.ai , archana@ethara.ai ";

    const res = await GET(callbackRequest({ code: "c", state: STATE }, STATE));

    expect(destination(res)).toBe("?auth=success");
    expect(saveTokens).toHaveBeenCalledTimes(1);
  });

  it("forgets the state cookie once the round trip is over", async () => {
    const res = await GET(callbackRequest({ code: "c", state: STATE }, STATE));

    expect(res.cookies.get(OAUTH_STATE_COOKIE)?.value).toBe("");
  });
});
