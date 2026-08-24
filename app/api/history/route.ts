import { NextRequest, NextResponse } from "next/server";
import type { gmail_v1 } from "@googleapis/gmail";
import { getAuthorizedClient, getGmail } from "@/lib/google";
import { getUserFromRequest } from "@/lib/session";
import { parseLeaveMail, extractBodyText } from "@/lib/parser";
import { loadDecisions, loadTeam } from "@/lib/store";
import { loadEmployees } from "@/lib/employees";
import { filterByTeam } from "@/lib/team";
import { historyMonthCount, monthStart } from "@/lib/history";
import {
  collectMessageRefs,
  windowedQuery,
  GMAIL_PAGE_SIZE,
  HISTORY_MAX_MESSAGES,
} from "@/lib/gmail-window";
import type { LeaveRequest } from "@/lib/types";

export const dynamic = "force-dynamic";

const SEARCH_QUERY =
  process.env.LEAVE_MAIL_QUERY ??
  'from:no-reply@greythr.com subject:"Leave Application from"';

const BATCH_SIZE = 40;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

export async function GET(req: NextRequest) {
  const months = historyMonthCount(req.nextUrl.searchParams.get("months"));
  const since = monthStart(new Date(), months - 1);

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
    const [profile, listed, decisions, employees, team] = await Promise.all([
      gmail.users.getProfile({ userId: "me" }),
      collectMessageRefs(HISTORY_MAX_MESSAGES, async (pageToken) => {
        const page = await gmail.users.messages.list({
          userId: "me",
          q: windowedQuery(SEARCH_QUERY, since),
          maxResults: GMAIL_PAGE_SIZE,
          pageToken,
        });
        return {
          refs: (page.data.messages ?? []).map((m) => ({ id: m.id ?? "" })),
          nextPageToken: page.data.nextPageToken ?? undefined,
        };
      }),
      loadDecisions(user),
      loadEmployees(),
      loadTeam(user),
    ]);

    const selfEmail = profile.data.emailAddress ?? "";
    const ids = listed.refs.map((r) => r.id);

    const messages: gmail_v1.Schema$Message[] = [];
    for (const batch of chunk(ids, BATCH_SIZE)) {
      const fetched = await Promise.all(
        batch.map((id) =>
          gmail.users.messages.get({ userId: "me", id, format: "full" })
        )
      );
      for (const res of fetched) messages.push(res.data);
    }

    const requests: LeaveRequest[] = [];
    for (const msg of messages) {
      const parsed = parseLeaveMail(msg, selfEmail);
      if (!parsed) continue;

      const id = msg.id ?? "";
      const directoryEntry = employees[parsed.employeeCode.toUpperCase()];
      const decision = decisions[id];
      const receivedMs = msg.internalDate
        ? parseInt(msg.internalDate)
        : Date.now();

      requests.push({
        id,
        threadId: msg.threadId ?? "",
        ...parsed,
        employeeEmail: directoryEntry?.email ?? parsed.employeeEmail,
        emailVerified: Boolean(directoryEntry),
        bodyText: extractBodyText(msg),
        receivedAt: new Date(receivedMs).toISOString(),
        status: decision?.status ?? "pending",
        decidedAt: decision?.decidedAt,
        decisionNote: decision?.note,
        mailSent: Boolean(decision?.sentTo),
      });
    }

    // Show only people on the manager's team (all, if no team is configured).
    const visible = filterByTeam(requests, team);
    visible.sort(
      (a, b) =>
        new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime()
    );

    return NextResponse.json({
      requests: visible,
      selfEmail,
      months,
      since: since.toISOString(),
      capped: listed.capped,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "gmail_error" },
      { status: 500 }
    );
  }
}
