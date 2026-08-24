import { NextRequest, NextResponse } from "next/server";
import type { gmail_v1 } from "@googleapis/gmail";
import { getAuthorizedClient, getGmail } from "@/lib/google";
import { getUserFromRequest } from "@/lib/session";
import { parseLeaveMail } from "@/lib/parser";
import { loadDecisions, loadTeam } from "@/lib/store";
import { filterByTeam } from "@/lib/team";
import { gmailAfterDate, monthStart } from "@/lib/history";
import { parseLeaveDate } from "@/lib/leave-dates";

export const dynamic = "force-dynamic";

const SEARCH_QUERY =
  process.env.LEAVE_MAIL_QUERY ??
  'from:no-reply@greythr.com subject:"Leave Application from"';

const MAX_MESSAGES = 500;
const BATCH_SIZE = 40;
// Look back a few months of applications so both recent and upcoming leaves are
// covered (a leave for next month was applied recently).
const MONTHS_BACK = 2;

// A single leave, reduced to what the calendar needs. Dates are day strings
// ("YYYY-MM-DD") so a leave never shifts between server and browser timezones.
export interface CalendarLeave {
  id: string;
  employeeName: string;
  employeeCode: string;
  leaveType: string;
  status: string;
  fromDate: string;
  toDate: string;
  fromYmd: string;
  toYmd: string;
  numberOfDays: number;
}

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

// Turn parsed leave requests into calendar entries: drop rejected ones (that
// person is not actually on leave) and anything whose dates don't parse.
function toCalendarLeaves(
  rows: {
    id: string;
    employeeName: string;
    employeeCode: string;
    leaveType: string;
    fromDate: string;
    toDate: string;
    numberOfDays: number;
    status: string;
  }[]
): CalendarLeave[] {
  const out: CalendarLeave[] = [];
  for (const r of rows) {
    if (r.status === "rejected") continue;
    const fromYmd = parseLeaveDate(r.fromDate);
    const toYmd = parseLeaveDate(r.toDate) ?? fromYmd;
    if (fromYmd === null || toYmd === null) continue;
    out.push({
      id: r.id,
      employeeName: r.employeeName,
      employeeCode: r.employeeCode,
      leaveType: r.leaveType,
      status: r.status,
      fromDate: r.fromDate,
      toDate: r.toDate,
      fromYmd,
      toYmd,
      numberOfDays: r.numberOfDays,
    });
  }
  return out;
}
