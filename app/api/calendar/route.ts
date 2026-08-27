import { NextRequest, NextResponse } from "next/server";
import { getAuthorizedClient, getGmail } from "@/lib/google";
import { getUserFromRequest } from "@/lib/session";
import { parseLeaveMail, extractBodyText } from "@/lib/parser";
import {
  loadDecisions,
  loadMailCache,
  saveMailCache,
  loadTeam,
} from "@/lib/store";
import {
  cacheEntryFromParsed,
  partitionCached,
  pruneMailCache,
} from "@/lib/mail-cache";
import { filterByTeam } from "@/lib/team";
import { checkRateLimit, REFETCH } from "@/lib/rate-limit";
import { gmailAfterDate } from "@/lib/history";
import { toCalendarLeaves } from "@/lib/calendar";
import { fetchDirectRequests } from "@/lib/direct-fetch";
import { dedupeLeaves } from "@/lib/dedupe";
import {
  calendarWindowStart,
  collectMessageRefs,
  windowedQuery,
  CALENDAR_MAX_MESSAGES,
  GMAIL_PAGE_SIZE,
  LEAVE_MAIL_QUERY,
} from "@/lib/gmail-window";
import type { CalendarCandidate } from "@/lib/calendar";
import type { DedupableRow } from "@/lib/dedupe";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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

  const since = calendarWindowStart();

  try {
    const gmail = getGmail(client);
    const [profile, listed, decisions, team, mailCache] = await Promise.all([
      gmail.users.getProfile({ userId: "me" }),
      collectMessageRefs(CALENDAR_MAX_MESSAGES, async (pageToken) => {
        const page = await gmail.users.messages.list({
          userId: "me",
          q: windowedQuery(LEAVE_MAIL_QUERY, since),
          maxResults: GMAIL_PAGE_SIZE,
          pageToken,
        });
        return {
          refs: (page.data.messages ?? []).map((m) => ({ id: m.id ?? "" })),
          nextPageToken: page.data.nextPageToken ?? undefined,
        };
      }),
      loadDecisions(user),
      loadTeam(user),
      loadMailCache(user),
    ]);

    const selfEmail = profile.data.emailAddress ?? "";
    const ids = [
      ...new Set(listed.refs.map((r) => r.id).filter(Boolean)),
    ];

    const { missing } = partitionCached(ids, mailCache);

    let cached = 0;
    for (const batch of chunk(missing, BATCH_SIZE)) {
      const fetched = await Promise.allSettled(
        batch.map((id) =>
          gmail.users.messages.get({ userId: "me", id, format: "full" })
        )
      );
      for (const res of fetched) {
        if (res.status !== "fulfilled") continue;
        const msg = res.value.data;
        const id = msg.id ?? "";
        if (!id) continue;
        mailCache.entries[id] = cacheEntryFromParsed(
          parseLeaveMail(msg, selfEmail),
          msg.internalDate ? parseInt(msg.internalDate) : Date.now(),
          msg.threadId ?? "",
          extractBodyText(msg)
        );
        cached += 1;
      }
    }

    if (cached > 0) {
      await saveMailCache(user, pruneMailCache(mailCache, Date.now()));
    }

    const rows = ids
      .map((id) => {
        const entry = mailCache.entries[id];
        if (!entry?.m) return null;
        return {
          id,
          ...entry.m,
          receivedAt: new Date(entry.t).toISOString(),
          status: decisions[id]?.status ?? "pending",
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    const direct = await fetchDirectRequests(gmail, user, gmailAfterDate(since), {
      selfEmail,
      team,
      decisions,
      skipIds: new Set(ids),
    });
    const directRows: (CalendarCandidate & DedupableRow)[] = direct
      .filter((r) => !r.needsReview)
      .map((r) => ({
        id: r.id,
        employeeName: r.employeeName,
        employeeCode: r.employeeCode,
        leaveType: r.leaveType,
        fromDate: r.fromDate,
        toDate: r.toDate,
        numberOfDays: r.numberOfDays,
        status: r.status,
        kind: r.kind,
        source: r.source,
        receivedAt: r.receivedAt,
      }));

    const leaves = toCalendarLeaves(
      dedupeLeaves(filterByTeam([...rows, ...directRows], team))
    );
    return NextResponse.json({ leaves });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "gmail_error" },
      { status: 500 }
    );
  }
}
