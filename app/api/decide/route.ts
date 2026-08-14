import { NextRequest, NextResponse } from "next/server";
import { getAuthorizedClient } from "@/lib/google";
import { sendDecisionMail } from "@/lib/mailer";
import { saveDecision } from "@/lib/store";
import type { LeaveRequest } from "@/lib/types";

export const dynamic = "force-dynamic";

interface DecideBody {
  request: LeaveRequest;
  action: "approved" | "rejected";
  to: string;
  cc: string[];
  note?: string;
}

export async function POST(req: NextRequest) {
  const client = await getAuthorizedClient();
  if (!client) {
    return NextResponse.json({ error: "not_connected" }, { status: 401 });
  }

  let body: DecideBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const { request, action, to, cc, note } = body;
  if (!request?.id || !["approved", "rejected"].includes(action)) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }
  if (!to || !/^[\w.+-]+@[\w-]+(\.[\w-]+)+$/.test(to)) {
    return NextResponse.json(
      { error: "invalid_recipient", message: `"${to}" is not a valid email` },
      { status: 400 }
    );
  }

  try {
    const sent = await sendDecisionMail(client, {
      request,
      action,
      note,
      to,
      cc: cc ?? [],
    });
    await saveDecision(request.id, {
      status: action,
      decidedAt: new Date().toISOString(),
      note,
      sentTo: to,
      cc,
    });
    return NextResponse.json({ ok: true, sent });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "send_failed" },
      { status: 500 }
    );
  }
}
