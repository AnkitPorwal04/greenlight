import { NextRequest, NextResponse } from "next/server";
import type { gmail_v1 } from "@googleapis/gmail";
import { getAuthorizedClient, getGmail } from "@/lib/google";
import { getUserFromRequest } from "@/lib/session";
import { parseLeaveMail } from "@/lib/parser";
import { loadDecisions, loadTeam } from "@/lib/store";
import { aggregateStatsForTeam, type StatsEntry } from "@/lib/stats";
import { LEAVE_MAIL_QUERY } from "@/lib/gmail-window";

export const dynamic = "force-dynamic";

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

  try {
    const gmail = getGmail(client);
    const [profile, list, decisions, team] = await Promise.all([
      gmail.users.getProfile({ userId: "me" }),
      gmail.users.messages.list({
        userId: "me",
        q: `${LEAVE_MAIL_QUERY} after:${process.env.STATS_SINCE ?? "2026/08/01"}`,
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

    const entries: StatsEntry[] = [];
    for (const msg of messages) {
      const parsed = parseLeaveMail(msg, selfEmail);
      if (!parsed) continue;
      // Cancellation requests are not leaves taken; keep them out of stats.
      if (parsed.kind === "cancellation") continue;
      const receivedMs = msg.internalDate
        ? parseInt(msg.internalDate)
        : Date.now();
      const id = msg.id ?? "";
      entries.push({
        id,
        employeeName: parsed.employeeName,
        employeeCode: parsed.employeeCode,
        leaveType: parsed.leaveType,
        numberOfDays: parsed.numberOfDays,
        receivedAt: new Date(receivedMs).toISOString(),
        status: decisions[id]?.status ?? "pending",
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
