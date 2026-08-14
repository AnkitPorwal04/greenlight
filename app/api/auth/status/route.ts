import { NextResponse } from "next/server";
import { getAuthorizedClient, getGmail, clearTokens } from "@/lib/google";

export const dynamic = "force-dynamic";

export async function GET() {
  const client = await getAuthorizedClient();
  if (!client) return NextResponse.json({ connected: false });
  try {
    const gmail = getGmail(client);
    const profile = await gmail.users.getProfile({ userId: "me" });
    return NextResponse.json({
      connected: true,
      email: profile.data.emailAddress,
    });
  } catch {
    return NextResponse.json({ connected: false });
  }
}

export async function DELETE() {
  await clearTokens();
  return NextResponse.json({ connected: false });
}
