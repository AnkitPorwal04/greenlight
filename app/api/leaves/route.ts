import { NextRequest, NextResponse } from "next/server";
import type { gmail_v1 } from "@googleapis/gmail";
import { getAuthorizedClient, getGmail } from "@/lib/google";
import { getUserFromRequest } from "@/lib/session";
import { parseLeaveMail, extractBodyText } from "@/lib/parser";
import {
  loadDecisions,
  loadMailCache,
  loadNoAuto,
  saveDecision,
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
import { fetchDirectRequests } from "@/lib/direct-fetch";
import { dedupeLeaves } from "@/lib/dedupe";
import { gmailAfterDate } from "@/lib/history";
import {
  collectMessageRefs,
  leavesWindowStart,
  windowedQuery,
  GMAIL_PAGE_SIZE,
  LEAVES_MAX_MESSAGES,
  LEAVE_MAIL_QUERY,
  SENT_MAIL_QUERY,
  SENT_PROBE_MAX_MESSAGES,
} from "@/lib/gmail-window";
import {
  replyCoversApplication,
  threadsWorthFetching,
} from "@/lib/thread-reply";
import type { Decision, LeaveRequest } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const THREAD_BATCH_SIZE = 25;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

async function loadThreads(
  gmail: gmail_v1.Gmail,
  threadIds: string[],
  into: Map<string, gmail_v1.Schema$Thread>,
): Promise<void> {
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
    fetched.forEach((res, i) => into.set(batch[i], res.data));
  }
}

export async function GET(req: NextRequest) {
  const user = getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "not_connected" }, { status: 401 });
  }

  const gate = await checkRateLimit("leaves", user, REFETCH);
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

  try {
    const gmail = getGmail(client);
    const since = leavesWindowStart();
    const [profile, listed, decisions, employees, undone, team, mailCache] =
      await Promise.all([
        gmail.users.getProfile({ userId: "me" }),
        collectMessageRefs(LEAVES_MAX_MESSAGES, async (pageToken) => {
          const page = await gmail.users.messages.list({
            userId: "me",
            q: windowedQuery(LEAVE_MAIL_QUERY, since),
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
        loadMailCache(user),
      ]);
    const noAuto = new Set(undone);
    const selfEmail = profile.data.emailAddress ?? "";
    const refs = listed.refs;

    const wantedIds = new Set(refs.map((r) => r.id));
    const { missing } = partitionCached([...wantedIds], mailCache);
    const missingIds = new Set(missing);

    const threads = new Map<string, gmail_v1.Schema$Thread>();
    await loadThreads(
      gmail,
      [
        ...new Set(
          refs
            .filter((r) => missingIds.has(r.id))
            .map((r) => r.threadId)
            .filter((tid): tid is string => Boolean(tid)),
        ),
      ],
      threads,
    );

    let cached = 0;
    for (const thread of threads.values()) {
      for (const msg of thread.messages ?? []) {
        const id = msg.id ?? "";
        if (!id || !missingIds.has(id)) continue;
        mailCache.entries[id] = cacheEntryFromParsed(
          parseLeaveMail(msg, selfEmail),
          msg.internalDate ? parseInt(msg.internalDate) : Date.now(),
          msg.threadId ?? "",
          extractBodyText(msg),
        );
        cached += 1;
      }
    }

    const requests: LeaveRequest[] = [];
    for (const ref of refs) {
      const entry = mailCache.entries[ref.id];
      if (!entry) continue;
      const request = buildLeaveRequest(ref.id, entry, employees, decisions);
      if (request) requests.push(request);
    }

    const applicationsPerThread = new Map<string, number>();
    for (const request of requests) {
      if (!request.threadId) continue;
      applicationsPerThread.set(
        request.threadId,
        (applicationsPerThread.get(request.threadId) ?? 0) + 1,
      );
    }

    const undecided = requests.filter(
      (r) => r.status === "pending" && !noAuto.has(r.id) && r.threadId,
    );
    if (undecided.length > 0) {
      const sent = await collectMessageRefs(
        SENT_PROBE_MAX_MESSAGES,
        async (pageToken) => {
          const page = await gmail.users.messages.list({
            userId: "me",
            q: windowedQuery(SENT_MAIL_QUERY, since),
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
        },
      );
      const repliedThreads = new Set(
        sent.refs
          .map((r) => r.threadId)
          .filter((tid): tid is string => Boolean(tid)),
      );
      await loadThreads(
        gmail,
        threadsWorthFetching(
          undecided.map((r) => r.threadId),
          repliedThreads,
          new Set(threads.keys()),
        ),
        threads,
      );
    }

    for (const request of undecided) {
      const thread = threads.get(request.threadId);
      if (!thread) continue;
      const covered = replyCoversApplication({
        messages: thread.messages ?? [],
        applicationMsgId: request.id,
        selfEmail,
        applicationsInThread:
          applicationsPerThread.get(request.threadId) ?? 1,
      });
      if (!covered) continue;
      const decision: Decision = {
        status: "handled",
        decidedAt: new Date().toISOString(),
        note: "Auto-detected: you already replied in this Gmail thread",
      };
      await saveDecision(user, request.id, decision);
      request.status = decision.status;
      request.decidedAt = decision.decidedAt;
      request.decisionNote = decision.note;
    }

    if (cached > 0) {
      await saveMailCache(user, pruneMailCache(mailCache, Date.now()));
    }

    const direct = await fetchDirectRequests(
      gmail,
      user,
      gmailAfterDate(since),
      { selfEmail, team, decisions, skipIds: wantedIds },
    );

    // Show only people on the manager's team (all, if no team is configured).
    const visible = dedupeLeaves([...filterByTeam(requests, team), ...direct]);
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
