import { NextRequest, NextResponse } from "next/server";
import { getAuthorizedClient } from "@/lib/google";
import { getUserFromRequest } from "@/lib/session";
import { saveDecision } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const user = getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "not_connected" }, { status: 401 });
  }

  const client = await getAuthorizedClient(user);
  if (!client) {
    return NextResponse.json({ error: "not_connected" }, { status: 401 });
  }

  let ids: string[];
  try {
    const body = await req.json();
    ids = Array.isArray(body.ids) ? body.ids.map(String) : [];
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (ids.length === 0) {
    return NextResponse.json({ error: "no_ids" }, { status: 400 });
  }

  const decidedAt = new Date().toISOString();
  for (const id of ids) {
    await saveDecision(user, id, {
      status: "handled",
      decidedAt,
      note: "Marked as handled (dealt with outside Greenlight)",
    });
  }
  return NextResponse.json({ ok: true, count: ids.length });
}
