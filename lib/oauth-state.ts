import crypto from "crypto";
import type { NextRequest, NextResponse } from "next/server";

export const OAUTH_STATE_COOKIE = "gl_oauth_state";
export const OAUTH_STATE_MAX_AGE_SECONDS = 60 * 10;

const STATE_BYTES = 32;

export function createOAuthState(): string {
  return crypto.randomBytes(STATE_BYTES).toString("hex");
}

export function oauthStateMatches(
  received: string | null | undefined,
  stored: string | null | undefined
): boolean {
  if (!received || !stored) return false;
  const provided = Buffer.from(received);
  const expected = Buffer.from(stored);
  if (provided.length !== expected.length) return false;
  return crypto.timingSafeEqual(provided, expected);
}

export function oauthStateCookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: maxAgeSeconds,
    path: "/",
  };
}

export function setOAuthStateCookie<T>(
  res: NextResponse<T>,
  state: string
): void {
  res.cookies.set(
    OAUTH_STATE_COOKIE,
    state,
    oauthStateCookieOptions(OAUTH_STATE_MAX_AGE_SECONDS)
  );
}

export function readOAuthStateCookie(req: NextRequest): string | null {
  return req.cookies.get(OAUTH_STATE_COOKIE)?.value ?? null;
}

export function clearOAuthStateCookie<T>(res: NextResponse<T>): void {
  res.cookies.set(OAUTH_STATE_COOKIE, "", oauthStateCookieOptions(0));
}
