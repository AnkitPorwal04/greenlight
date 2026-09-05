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
  buildLeaveRequest,
  cacheEntryFromParsed,
  partitionCached,
  pruneMailCache,
} from "@/lib/mail-cache";
import { loadEmployees } from "@/lib/employees";
import { filterByTeam } from "@/lib/team";
import { checkRateLimit, REFETCH } from "@/lib/rate-limit";
import { createLedger } from "@/lib/quota";
import { noteGmailFailure, readBreaker } from "@/lib/gmail-breaker";
import { cachedIdsSince } from "@/lib/cached-window";
import { fetchDirectRequests } from "@/lib/direct-fetch";
import { gmailAfterDate, historyMonthCount, monthStart } from "@/lib/history";
import {
  collectMessageRefs,
  windowedQuery,
  GMAIL_PAGE_SIZE,
  HISTORY_MAX_MESSAGES,
  LEAVE_MAIL_QUERY,
} from "@/lib/gmail-window";
import type { LeaveRequest } from "@/lib/types";

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
  const months = historyMonthCount(req.nextUrl.searchParams.get("months"));
  const since = monthStart(new Date(), months - 1);

  const user = getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "not_connected" }, { status: 401 });
  }

  const gate = await checkRateLimit("history", user, REFETCH);
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

  const ledger = createLedger(user);
  const breaker = await readBreaker(user);
  const skipGmail = breaker !== null;

  try {
    const gmail = getGmail(client);
    const [profile, listed, decisions, employees, team, mailCache] =
      await Promise.all([
        skipGmail
          ? Promise.resolve(null)
          : gmail.users.getProfile({ userId: "me" }).then(async (res) => {
              await ledger.charge("getProfile");
              return res;
            }),
        collectMessageRefs(HISTORY_MAX_MESSAGES, async (pageToken) => {
          if (skipGmail) return { refs: [] };
          if (!(await ledger.afford("messages.list"))) return { refs: [] };
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
        loadEmployees(),
        loadTeam(user),
        loadMailCache(user),
      ]);

    const selfEmail = profile?.data.emailAddress ?? "";
    const ids = skipGmail
      ? cachedIdsSince(mailCache.entries, since.getTime(), HISTORY_MAX_MESSAGES)
      : listed.refs.map((r) => r.id);
    const { missing } = partitionCached(ids, mailCache);

    let cached = 0;
    for (const batch of chunk(missing, BATCH_SIZE)) {
      if (!(await ledger.afford("messages.get", batch.length))) break;
      const fetched = await Promise.all(
        batch.map((id) =>
          gmail.users.messages.get({ userId: "me", id, format: "full" })
        )
      );
      for (const res of fetched) {
        const msg = res.data;
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

    const requests: LeaveRequest[] = [];
    for (const id of ids) {
      const entry = mailCache.entries[id];
      if (!entry) continue;
      const request = buildLeaveRequest(id, entry, employees, decisions);
      if (request) requests.push(request);
    }

    const direct = skipGmail
      ? []
      : await fetchDirectRequests(gmail, user, gmailAfterDate(since), {
          selfEmail,
          team,
          decisions,
          skipIds: new Set(ids),
          ledger,
        });

    // Show only people on the manager's team (all, if no team is configured).
    const visible = [...filterByTeam(requests, team), ...direct];
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
      ...(breaker
        ? { partial: true as const, retryAtMs: breaker.retryAt }
        : ledger.exhausted
          ? { partial: true as const, retryAtMs: ledger.resetAtMs }
          : {}),
    });
  } catch (e) {
    const tripped = await noteGmailFailure(user, e);
    if (tripped) {
      return NextResponse.json({
        requests: [],
        selfEmail: "",
        months,
        since: since.toISOString(),
        capped: false,
        partial: true as const,
        retryAtMs: tripped.retryAt,
      });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "gmail_error" },
      { status: 500 }
    );
  }
}
