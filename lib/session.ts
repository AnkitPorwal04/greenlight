import crypto from "crypto";
import type { NextRequest, NextResponse } from "next/server";

const USER_COOKIE = "gl_user";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 180;

function secret(): string {
  return process.env.APP_PASSCODE ?? "greenlight-dev-secret";
}

function hmac(email: string): string {
  return crypto.createHmac("sha256", secret()).update(email).digest("hex");
}

export function signUser(email: string): string {
  const normalized = email.trim().toLowerCase();
  return `${normalized}.${hmac(normalized)}`;
}

export function verifyUser(value: string | null | undefined): string | null {
  if (!value) return null;
  const sep = value.lastIndexOf(".");
  if (sep <= 0 || sep === value.length - 1) return null;

  const email = value.slice(0, sep).toLowerCase();
  const provided = Buffer.from(value.slice(sep + 1));
  const expected = Buffer.from(hmac(email));
  if (provided.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(provided, expected)) return null;
  return email;
}

export function getUserFromRequest(req: NextRequest): string | null {
  return verifyUser(req.cookies.get(USER_COOKIE)?.value);
}

export function setUserCookie<T>(res: NextResponse<T>, email: string): void {
  res.cookies.set(USER_COOKIE, signUser(email), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: MAX_AGE_SECONDS,
    path: "/",
  });
}

export function clearUserCookie<T>(res: NextResponse<T>): void {
  res.cookies.set(USER_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
}
