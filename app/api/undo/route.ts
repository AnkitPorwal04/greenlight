import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/session";
import { deleteDecision } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const user = getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "not_connected" }, { status: 401 });
  }

  let id: string;
  try {
    const body = await req.json();
    id = typeof body.id === "string" ? body.id.trim() : "";
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!id) {
    return NextResponse.json({ error: "no_id" }, { status: 400 });
  }

  await deleteDecision(user, id, { suppressAuto: true });
  return NextResponse.json({ ok: true });
}
