import { NextRequest, NextResponse } from "next/server";
import { getAuthorizedClient } from "@/lib/google";
import { getUserFromRequest } from "@/lib/session";
import { saveDecision } from "@/lib/store";
import { isRecordedStatus, recordedNote } from "@/lib/outcome";
import type { RecordedStatus } from "@/lib/outcome";

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
  let status: RecordedStatus;
  try {
    const body = await req.json();
    ids = Array.isArray(body.ids) ? body.ids.map(String) : [];
    if (body.status === undefined || body.status === null) {
      status = "handled";
    } else if (isRecordedStatus(body.status)) {
      status = body.status;
    } else {
      return NextResponse.json({ error: "invalid_status" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (ids.length === 0) {
    return NextResponse.json({ error: "no_ids" }, { status: 400 });
  }

  const decidedAt = new Date().toISOString();
  const note = recordedNote(status);
  for (const id of ids) {
    await saveDecision(user, id, { status, decidedAt, note });
  }
  return NextResponse.json({ ok: true, count: ids.length, status });
}
