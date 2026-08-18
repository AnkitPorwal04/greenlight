import { NextRequest, NextResponse } from "next/server";
import type { gmail_v1 } from "@googleapis/gmail";
import { getAuthorizedClient, getGmail } from "@/lib/google";
import { getUserFromRequest } from "@/lib/session";
import { parseLeaveMail, extractBodyText } from "@/lib/parser";
import { loadDecisions } from "@/lib/store";
import { loadEmployees } from "@/lib/employees";
import { gmailAfterDate, historyMonthCount, monthStart } from "@/lib/history";
import type { LeaveRequest } from "@/lib/types";

export const dynamic = "force-dynamic";

const SEARCH_QUERY =
  process.env.LEAVE_MAIL_QUERY ??
  'from:no-reply@greythr.com subject:"Leave Application from"';

const MAX_MESSAGES = 500;
const BATCH_SIZE = 40;

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

  const months = historyMonthCount(req.nextUrl.searchParams.get("months"));
  const since = monthStart(new Date(), months - 1);

  try {
    const gmail = getGmail(client);
    const [profile, list, decisions, employees] = await Promise.all([
      gmail.users.getProfile({ userId: "me" }),
      gmail.users.messages.list({
        userId: "me",
        q: `${SEARCH_QUERY} after:${gmailAfterDate(since)}`,
        maxResults: MAX_MESSAGES,
      }),
      loadDecisions(user),
      loadEmployees(),
    ]);

    const selfEmail = profile.data.emailAddress ?? "";
    const ids = [
      ...new Set(
        (list.data.messages ?? [])
          .map((m) => m.id)
          .filter((id): id is string => Boolean(id))
      ),
    ];

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
      });
    }

    requests.sort(
      (a, b) =>
        new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime()
    );

    return NextResponse.json({
      requests,
      selfEmail,
      months,
      since: since.toISOString(),
      capped: Boolean(list.data.nextPageToken),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "gmail_error" },
      { status: 500 }
    );
  }
}
