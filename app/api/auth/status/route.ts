import { NextRequest, NextResponse } from "next/server";
import { getAuthorizedClient, getGmail, clearTokens } from "@/lib/google";
import { getUserFromRequest, clearUserCookie } from "@/lib/session";
import { loadTeam } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const email = getUserFromRequest(req);
  if (!email) return NextResponse.json({ connected: false });

  const client = await getAuthorizedClient(email);
  if (!client) return NextResponse.json({ connected: false });

  try {
    const gmail = getGmail(client);
    const [profile, team] = await Promise.all([
      gmail.users.getProfile({ userId: "me" }),
      loadTeam(email),
    ]);
    return NextResponse.json({
      connected: true,
      email: profile.data.emailAddress,
      hasTeam: team.length > 0,
    });
  } catch {
    return NextResponse.json({ connected: false });
  }
}

export async function DELETE(req: NextRequest) {
  const email = getUserFromRequest(req);
  if (email) await clearTokens(email);
  const res = NextResponse.json({ connected: false });
  clearUserCookie(res);
  return res;
}
