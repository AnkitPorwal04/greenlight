import { NextRequest, NextResponse } from "next/server";
import { getOAuthClient, GMAIL_SCOPES } from "@/lib/google";
import { createOAuthState, setOAuthStateCookie } from "@/lib/oauth-state";

export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  try {
    const client = getOAuthClient(req.nextUrl.origin);
    const state = createOAuthState();
    const url = client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: GMAIL_SCOPES,
      state,
    });
    const res = NextResponse.redirect(url);
    setOAuthStateCookie(res, state);
    return res;
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "OAuth config error" },
      { status: 500 }
    );
  }
}
