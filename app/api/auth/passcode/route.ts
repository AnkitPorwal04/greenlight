import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const passcode = process.env.APP_PASSCODE;
  if (!passcode) {
    return NextResponse.json({ ok: true, note: "no passcode configured" });
  }

  let provided: string;
  try {
    const body = await req.json();
    provided = String(body.passcode ?? "");
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const a = crypto.createHash("sha256").update(provided).digest();
  const b = crypto.createHash("sha256").update(passcode).digest();
  if (!crypto.timingSafeEqual(a, b)) {
    return NextResponse.json({ error: "wrong_passcode" }, { status: 401 });
  }

  const hash = crypto.createHash("sha256").update(passcode).digest("hex");
  const res = NextResponse.json({ ok: true });
  res.cookies.set("lp_session", hash, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
  return res;
}
