import { NextRequest, NextResponse } from "next/server";
import type { gmail_v1 } from "@googleapis/gmail";
import { getAuthorizedClient, getGmail } from "@/lib/google";
import { getUserFromRequest } from "@/lib/session";
import { parseLeaveMail } from "@/lib/parser";
import { loadDecisions, loadTeam } from "@/lib/store";
import { filterByTeam } from "@/lib/team";
import { checkRateLimit, REFETCH } from "@/lib/rate-limit";
import { gmailAfterDate, monthStart } from "@/lib/history";
import { toCalendarLeaves } from "@/lib/calendar";

export const dynamic = "force-dynamic";

const SEARCH_QUERY =
  process.env.LEAVE_MAIL_QUERY ??
  'from:no-reply@greythr.com subject:"Leave Application from"';

const MAX_MESSAGES = 500;
const BATCH_SIZE = 40;
// Look back a few months of applications so both recent and upcoming leaves are
// covered (a leave for next month was applied recently).
const MONTHS_BACK = 2;

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

  const gate = await checkRateLimit("calendar", user, REFETCH);
  if (!gate.allowed) {
    return NextResponse.json(
      { error: "rate_limited" },
      {
        status: 429,
        headers: { "Retry-After": String(gate.retryAfterSeconds) },
      }
    );
  }

  const client = await getAuthorizedClient(user);
  if (!client) {
    return NextResponse.json({ error: "not_connected" }, { status: 401 });
  }

  const since = monthStart(new Date(), MONTHS_BACK);

  try {
    const gmail = getGmail(client);
    const [profile, list, decisions, team] = await Promise.all([
      gmail.users.getProfile({ userId: "me" }),
      gmail.users.messages.list({
        userId: "me",
        q: `${SEARCH_QUERY} after:${gmailAfterDate(since)}`,
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
      const fetched = await Promise.allSettled(
        batch.map((id) =>
          gmail.users.messages.get({ userId: "me", id, format: "full" })
        )
      );
      for (const res of fetched) {
        if (res.status === "fulfilled") messages.push(res.value.data);
      }
    }

    const rows = messages
      .map((msg) => {
        const parsed = parseLeaveMail(msg, selfEmail);
        if (!parsed) return null;
        const status = decisions[msg.id ?? ""]?.status ?? "pending";
        return {
          id: msg.id ?? "",
          ...parsed,
          status,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    const leaves = toCalendarLeaves(filterByTeam(rows, team));
    return NextResponse.json({ leaves });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "gmail_error" },
      { status: 500 }
    );
  }
}
