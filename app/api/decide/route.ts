import { NextRequest, NextResponse } from "next/server";
import { getAuthorizedClient } from "@/lib/google";
import { getUserFromRequest } from "@/lib/session";
import { sendDecisionMail } from "@/lib/mailer";
import { saveDecision, loadDecisions, deleteDecision } from "@/lib/store";
import { loadEmployees } from "@/lib/employees";
import { replyAllCc } from "@/lib/direct";
import type { LeaveRequest } from "@/lib/types";

export const dynamic = "force-dynamic";

interface DecideBody {
  request: LeaveRequest;
  action: "approved" | "rejected";
  to: string;
  cc: string[];
  body?: string;
  note?: string;
  // Manager explicitly confirmed a recipient that is not in the directory.
  confirmed?: boolean;
}

const EMAIL_RE = /^[\w.+-]+@[\w-]+(\.[\w-]+)+$/;

// Keep only well-formed, de-duplicated CC addresses.
function cleanCc(cc: unknown): string[] {
  if (!Array.isArray(cc)) return [];
  const seen = new Set<string>();
  for (const raw of cc) {
    const addr = String(raw).trim();
    if (EMAIL_RE.test(addr)) seen.add(addr);
  }
  return [...seen];
}

export async function POST(req: NextRequest) {
  let body: DecideBody;

  const user = getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "not_connected" }, { status: 401 });
  }

  const client = await getAuthorizedClient(user);
  if (!client) {
    return NextResponse.json({ error: "not_connected" }, { status: 401 });
  }

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const { request, action, to, note } = body;
  if (!request?.id || !["approved", "rejected"].includes(action)) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }
  if (!to || !EMAIL_RE.test(to)) {
    return NextResponse.json(
      { error: "invalid_recipient", message: `"${to}" is not a valid email` },
      { status: 400 }
    );
  }

  // Mis-send guard: only allow sending to the address verified from the
  // directory unless the manager explicitly confirmed the recipient. This
  // stops decisions going to a guessed address (or a wrong one typed in),
  // and is enforced here so a client bug or direct API call can't skip it.
  const employees = await loadEmployees();
  const dirEmail = employees[request.employeeCode?.toUpperCase() ?? ""]?.email;
  const recipientTrusted =
    !!dirEmail && dirEmail.toLowerCase() === to.trim().toLowerCase();

  const isDirect = request.source === "direct";
  if (isDirect && !recipientTrusted) {
    return NextResponse.json(
      {
        error: "unverified_recipient",
        message:
          "A direct request can only be answered at the address in your employee directory.",
      },
      { status: 400 }
    );
  }
  if (!recipientTrusted && body.confirmed !== true) {
    return NextResponse.json(
      {
        error: "unverified_recipient",
        message:
          "This address is not verified from your employee directory. Confirm the recipient (or add them to the directory) before sending.",
      },
      { status: 400 }
    );
  }

  const cc = isDirect ? replyAllCc(body.cc, user, to) : cleanCc(body.cc);

  // Idempotency guard: a request that was already approved/rejected has already
  // had its mail sent — never send a second one (double-click, stale tab, retry).
  const existing = (await loadDecisions(user))[request.id];
  if (existing?.status === "approved" || existing?.status === "rejected") {
    return NextResponse.json({
      ok: true,
      alreadyDecided: true,
      sentTo: existing.sentTo,
    });
  }

  const decision = {
    status: action,
    decidedAt: new Date().toISOString(),
    note,
    sentTo: to,
    cc,
  } as const;

  // Record the decision BEFORE sending. If anything after this dies, the record
  // already exists, so the request won't reappear as pending and get re-sent.
  try {
    await saveDecision(user, request.id, decision);
  } catch {
    return NextResponse.json(
      {
        error: "record_failed",
        message: "Could not record the decision — no mail was sent. Try again.",
      },
      { status: 500 }
    );
  }

  try {
    const sent = await sendDecisionMail(client, {
      request,
      action,
      to,
      cc,
      body: typeof body.body === "string" ? body.body : undefined,
    });
    return NextResponse.json({ ok: true, sent });
  } catch (e) {
    // Send failed — roll back the record so the manager can safely retry.
    // (No mail went out, so leaving it "decided" would wrongly hide the request.)
    await deleteDecision(user, request.id).catch(() => {});
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "send_failed" },
      { status: 500 }
    );
  }
}
