import { NextRequest, NextResponse } from "next/server";
import { getOAuthClient, getGmail, saveTokens } from "@/lib/google";
import { setUserCookie } from "@/lib/session";
import {
  clearOAuthStateCookie,
  oauthStateMatches,
  readOAuthStateCookie,
} from "@/lib/oauth-state";

export const dynamic = "force-dynamic";

function redirectAndForgetState(req: NextRequest, target: string) {
  const res = NextResponse.redirect(new URL(target, req.url));
  clearOAuthStateCookie(res);
  return res;
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (!code) {
    return redirectAndForgetState(req, "/?auth=denied");
  }

  const returnedState = req.nextUrl.searchParams.get("state");
  if (!oauthStateMatches(returnedState, readOAuthStateCookie(req))) {
    return redirectAndForgetState(req, "/?auth=error");
  }

  try {
    const client = getOAuthClient(req.nextUrl.origin);
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);

    const profile = await getGmail(client).users.getProfile({ userId: "me" });
    const email = profile.data.emailAddress;
    if (!email) {
      return redirectAndForgetState(req, "/?auth=error");
    }

    await saveTokens(email, tokens);
    const res = redirectAndForgetState(req, "/?auth=success");
    setUserCookie(res, email);
    return res;
  } catch {
    return redirectAndForgetState(req, "/?auth=error");
  }
}
