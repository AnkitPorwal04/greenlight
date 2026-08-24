import { NextRequest, NextResponse } from "next/server";
import { getAuthorizedClient } from "@/lib/google";
import { getUserFromRequest } from "@/lib/session";
import { saveDecisions } from "@/lib/store";
import { isRecordedStatus, recordedNote } from "@/lib/outcome";
import type { RecordedStatus } from "@/lib/outcome";

export const dynamic = "force-dynamic";

const MAX_IDS = 200;
const MESSAGE_ID_RE = /^[A-Za-z0-9_-]{1,32}$/;

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
  if (ids.length > MAX_IDS) {
    return NextResponse.json({ error: "too_many" }, { status: 400 });
  }
  if (!ids.every((id) => MESSAGE_ID_RE.test(id))) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  const decidedAt = new Date().toISOString();
  const note = recordedNote(status);
  await saveDecisions(user, ids, { status, decidedAt, note });
  return NextResponse.json({ ok: true, count: ids.length, status });
}
