import { NextRequest, NextResponse } from "next/server";
import { getOAuthClient, GMAIL_SCOPES } from "@/lib/google";

export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  try {
    const client = getOAuthClient(req.nextUrl.origin);
    const url = client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: GMAIL_SCOPES,
    });
    return NextResponse.redirect(url);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "OAuth config error" },
      { status: 500 }
    );
  }
}
