import { NextRequest, NextResponse } from "next/server";
import type { gmail_v1 } from "@googleapis/gmail";
import { getAuthorizedClient, getGmail } from "@/lib/google";
import { getUserFromRequest } from "@/lib/session";
import { parseLeaveMail } from "@/lib/parser";
import { loadDecisions, loadTeam } from "@/lib/store";
import { aggregateStatsForTeam, type StatsEntry } from "@/lib/stats";
import { cancelledLeaveKeys, isLeaveCancelled } from "@/lib/cancellation";
import { fetchDirectRequests } from "@/lib/direct-fetch";
import { LEAVE_MAIL_QUERY } from "@/lib/gmail-window";

export const dynamic = "force-dynamic";

const MAX_MESSAGES = 500;
const BATCH_SIZE = 40;
const STATS_SINCE = process.env.STATS_SINCE ?? "2026/08/01";

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
    const [profile, list, decisions, team] = await Promise.all([
      gmail.users.getProfile({ userId: "me" }),
      gmail.users.messages.list({
        userId: "me",
        q: `${LEAVE_MAIL_QUERY} after:${STATS_SINCE}`,
        maxResults: MAX_MESSAGES,
      }),
      loadDecisions(user),
      loadTeam(user),
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

    const parsedRows = messages
      .map((msg) => {
        const parsed = parseLeaveMail(msg, selfEmail);
        if (!parsed) return null;
        const id = msg.id ?? "";
        return { msg, parsed, id, status: decisions[id]?.status ?? "pending" };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    // A leave whose cancellation has been approved was not actually taken.
    const cancelled = cancelledLeaveKeys(
      parsedRows.map((r) => ({
        employeeCode: r.parsed.employeeCode,
        fromDate: r.parsed.fromDate,
        toDate: r.parsed.toDate,
        status: r.status,
        kind: r.parsed.kind,
      }))
    );

    const entries: StatsEntry[] = [];
    for (const r of parsedRows) {
      // Cancellation requests are not leaves taken; keep them out of stats.
      if (r.parsed.kind === "cancellation") continue;
      // Neither is a leave the employee later cancelled.
      if (isLeaveCancelled(r.parsed, cancelled)) continue;
      const receivedMs = r.msg.internalDate
        ? parseInt(r.msg.internalDate)
        : Date.now();
      entries.push({
        id: r.id,
        employeeName: r.parsed.employeeName,
        employeeCode: r.parsed.employeeCode,
        leaveType: r.parsed.leaveType,
        numberOfDays: r.parsed.numberOfDays,
        receivedAt: new Date(receivedMs).toISOString(),
        status: r.status,
      });
    }

    const direct = await fetchDirectRequests(gmail, user, STATS_SINCE, {
      selfEmail,
      team,
      decisions,
      skipIds: new Set(ids),
    });

    for (const r of direct) {
      if (r.needsReview) continue;
      if (r.kind === "cancellation") continue;
      if (isLeaveCancelled(r, cancelled)) continue;
      entries.push({
        id: r.id,
        employeeName: r.employeeName,
        employeeCode: r.employeeCode,
        leaveType: r.leaveType,
        numberOfDays: r.numberOfDays,
        receivedAt: r.receivedAt,
        status: r.status,
      });
    }

    // Count only people on the manager's team (all, if no team is configured).
    return NextResponse.json(aggregateStatsForTeam(entries, team));
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "gmail_error" },
      { status: 500 }
    );
  }
}
