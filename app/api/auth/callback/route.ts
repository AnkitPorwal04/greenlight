import { NextRequest, NextResponse } from "next/server";
import { getOAuthClient, getGmail, saveTokens } from "@/lib/google";
import { setUserCookie } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (!code) {
    return NextResponse.redirect(new URL("/?auth=denied", req.url));
  }
  try {
    const client = getOAuthClient(req.nextUrl.origin);
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);

    const profile = await getGmail(client).users.getProfile({ userId: "me" });
    const email = profile.data.emailAddress;
    if (!email) {
      return NextResponse.redirect(new URL("/?auth=error", req.url));
    }

    await saveTokens(email, tokens);
    const res = NextResponse.redirect(new URL("/?auth=success", req.url));
    setUserCookie(res, email);
    return res;
  } catch {
    return NextResponse.redirect(new URL("/?auth=error", req.url));
  }
}
