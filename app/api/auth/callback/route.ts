import { NextRequest, NextResponse } from "next/server";
import { getOAuthClient, saveTokens } from "@/lib/google";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (!code) {
    return NextResponse.redirect(new URL("/?auth=denied", req.url));
  }
  try {
    const client = getOAuthClient(req.nextUrl.origin);
    const { tokens } = await client.getToken(code);
    await saveTokens(tokens);
    return NextResponse.redirect(new URL("/?auth=success", req.url));
  } catch {
    return NextResponse.redirect(new URL("/?auth=error", req.url));
  }
}
