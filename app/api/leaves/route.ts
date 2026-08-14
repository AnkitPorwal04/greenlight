import { NextRequest, NextResponse } from "next/server";
import type { gmail_v1 } from "@googleapis/gmail";
import { getAuthorizedClient, getGmail } from "@/lib/google";
import { getUserFromRequest } from "@/lib/session";
import { parseLeaveMail, extractBodyText } from "@/lib/parser";
import { loadDecisions, saveDecision } from "@/lib/store";
import { loadEmployees } from "@/lib/employees";
import type { LeaveRequest } from "@/lib/types";

function fromHeader(msg: gmail_v1.Schema$Message): string {
  return (
    msg.payload?.headers?.find((h) => h.name?.toLowerCase() === "from")
      ?.value ?? ""
  ).toLowerCase();
}

function threadHasMyReply(
  thread: gmail_v1.Schema$Thread,
  applicationMsgId: string,
  selfEmail: string
): boolean {
  const self = selfEmail.toLowerCase();
  return (thread.messages ?? []).some(
    (m) => m.id !== applicationMsgId && fromHeader(m).includes(self)
  );
}

export const dynamic = "force-dynamic";

const SEARCH_QUERY =
  process.env.LEAVE_MAIL_QUERY ??
  'from:no-reply@greythr.com subject:"Leave Application from"';

export async function GET(req: NextRequest) {
  const user = getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "not_connected" }, { status: 401 });
  }

  const client = await getAuthorizedClient(user);
  if (!client) {
    return NextResponse.json({ error: "not_connected" }, { status: 401 });
  }

  try {
    const gmail = getGmail(client);
    const [profile, list, decisions, employees] = await Promise.all([
      gmail.users.getProfile({ userId: "me" }),
      gmail.users.messages.list({
        userId: "me",
        q: SEARCH_QUERY,
        maxResults: 50,
      }),
      loadDecisions(user),
      loadEmployees(),
    ]);
    const selfEmail = profile.data.emailAddress ?? "";
    const ids = list.data.messages ?? [];

    const threadIds = [...new Set(ids.map((m) => m.threadId!))];
    const threads = await Promise.all(
      threadIds.map((tid) =>
        gmail.users.threads.get({
          userId: "me",
          id: tid,
          format: "full",
        })
      )
    );

    const wantedIds = new Set(ids.map((m) => m.id!));
    const requests: LeaveRequest[] = [];
    for (const res of threads) {
      const thread = res.data;
      const msg = (thread.messages ?? []).find((m) => wantedIds.has(m.id!));
      if (!msg) continue;
      const parsed = parseLeaveMail(msg, selfEmail);
      if (!parsed) continue;

      const directoryEntry = employees[parsed.employeeCode.toUpperCase()];
      let decision = decisions[msg.id!];

      if (!decision && threadHasMyReply(thread, msg.id!, selfEmail)) {
        decision = {
          status: "handled",
          decidedAt: new Date().toISOString(),
          note: "Auto-detected: you already replied in this Gmail thread",
        };
        await saveDecision(user, msg.id!, decision);
      }

      const receivedMs = msg.internalDate
        ? parseInt(msg.internalDate)
        : Date.now();
      const employeeEmail = directoryEntry?.email ?? parsed.employeeEmail;

      if (!decision && employeeEmail) {
        const sent = await gmail.users.messages.list({
          userId: "me",
          q: `in:sent to:${employeeEmail} after:${Math.floor(receivedMs / 1000)}`,
          maxResults: 1,
        });
        if (sent.data.messages?.length) {
          decision = {
            status: "handled",
            decidedAt: new Date().toISOString(),
            note: `Auto-detected: you mailed ${employeeEmail} after this request`,
          };
          await saveDecision(user, msg.id!, decision);
        }
      }
      requests.push({
        id: msg.id!,
        threadId: msg.threadId ?? "",
        ...parsed,
        employeeEmail,
        emailVerified: Boolean(directoryEntry),
        bodyText: extractBodyText(msg),
        receivedAt: new Date(receivedMs).toISOString(),
        status: decision?.status ?? "pending",
        decidedAt: decision?.decidedAt,
        decisionNote: decision?.note,
      });
    }

    requests.sort(
      (a, b) =>
        new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime()
    );

    return NextResponse.json({ requests, selfEmail });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "gmail_error" },
      { status: 500 }
    );
  }
}
