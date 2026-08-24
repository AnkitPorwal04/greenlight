import { NextRequest, NextResponse } from "next/server";
import type { gmail_v1 } from "@googleapis/gmail";
import { getAuthorizedClient, getGmail } from "@/lib/google";
import { getUserFromRequest } from "@/lib/session";
import { parseLeaveMail, extractBodyText } from "@/lib/parser";
import { loadDecisions, loadNoAuto, saveDecision, loadTeam } from "@/lib/store";
import { loadEmployees } from "@/lib/employees";
import { filterByTeam } from "@/lib/team";
import {
  collectMessageRefs,
  leavesWindowStart,
  windowedQuery,
  GMAIL_PAGE_SIZE,
  LEAVES_MAX_MESSAGES,
} from "@/lib/gmail-window";
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
  selfEmail: string,
): boolean {
  const self = selfEmail.toLowerCase();
  const msgs = thread.messages ?? [];
  const app = msgs.find((m) => m.id === applicationMsgId);
  const appTime = app?.internalDate ? parseInt(app.internalDate) : 0;
  return msgs.some(
    (m) =>
      m.id !== applicationMsgId &&
      fromHeader(m).includes(self) &&
      (m.internalDate ? parseInt(m.internalDate) : 0) > appTime,
  );
}

export const dynamic = "force-dynamic";

const SEARCH_QUERY =
  process.env.LEAVE_MAIL_QUERY ??
  'from:no-reply@greythr.com subject:"Leave Application from"';

const THREAD_BATCH_SIZE = 25;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

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
    const since = leavesWindowStart();
    const [profile, listed, decisions, employees, undone, team] =
      await Promise.all([
        gmail.users.getProfile({ userId: "me" }),
        collectMessageRefs(LEAVES_MAX_MESSAGES, async (pageToken) => {
          const page = await gmail.users.messages.list({
            userId: "me",
            q: windowedQuery(SEARCH_QUERY, since),
            maxResults: GMAIL_PAGE_SIZE,
            pageToken,
          });
          return {
            refs: (page.data.messages ?? []).map((m) => ({
              id: m.id ?? "",
              threadId: m.threadId ?? undefined,
            })),
            nextPageToken: page.data.nextPageToken ?? undefined,
          };
        }),
        loadDecisions(user),
        loadEmployees(),
        loadNoAuto(user),
        loadTeam(user),
      ]);
    const noAuto = new Set(undone);
    const selfEmail = profile.data.emailAddress ?? "";
    const refs = listed.refs;

    const threadIds = [
      ...new Set(
        refs
          .map((r) => r.threadId)
          .filter((tid): tid is string => Boolean(tid)),
      ),
    ];
    const threads: gmail_v1.Schema$Thread[] = [];
    for (const batch of chunk(threadIds, THREAD_BATCH_SIZE)) {
      const fetched = await Promise.all(
        batch.map((tid) =>
          gmail.users.threads.get({
            userId: "me",
            id: tid,
            format: "full",
          }),
        ),
      );
      for (const res of fetched) threads.push(res.data);
    }

    const wantedIds = new Set(refs.map((r) => r.id));
    const requests: LeaveRequest[] = [];
    for (const thread of threads) {
      const wanted = (thread.messages ?? []).filter((m) =>
        wantedIds.has(m.id!),
      );
      for (const msg of wanted) {
        const parsed = parseLeaveMail(msg, selfEmail);
        if (!parsed) continue;

        const directoryEntry = employees[parsed.employeeCode.toUpperCase()];
        let decision = decisions[msg.id!];

        const autoAllowed = !noAuto.has(msg.id!);

        if (
          !decision &&
          autoAllowed &&
          threadHasMyReply(thread, msg.id!, selfEmail)
        ) {
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

        if (!decision && autoAllowed && employeeEmail) {
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
          mailSent: Boolean(decision?.sentTo),
        });
      }
    }

    // Show only people on the manager's team (all, if no team is configured).
    const visible = filterByTeam(requests, team);
    visible.sort(
      (a, b) =>
        new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime(),
    );

    return NextResponse.json({
      requests: visible,
      selfEmail,
      since: since.toISOString(),
      capped: listed.capped,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "gmail_error" },
      { status: 500 },
    );
  }
}
