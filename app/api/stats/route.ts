import { NextRequest, NextResponse } from "next/server";
import type { gmail_v1 } from "@googleapis/gmail";
import { getAuthorizedClient, getGmail } from "@/lib/google";
import { getUserFromRequest } from "@/lib/session";
import { parseLeaveMail, extractBodyText } from "@/lib/parser";
import {
  loadDecisions,
  loadMailCache,
  loadSyncState,
  saveMailCache,
  saveSyncState,
  loadTeam,
} from "@/lib/store";
import {
  decideSync,
  normalizeHistoryId,
  syncStateToStore,
} from "@/lib/gmail-sync";
import {
  cacheEntryFromParsed,
  partitionCached,
  pruneMailCache,
} from "@/lib/mail-cache";
import {
  aggregateStatsForTeam,
  isWithdrawn,
  teamRoster,
  type StatsEntry,
} from "@/lib/stats";
import { loadEmployees } from "@/lib/employees";
import { cancelledLeaveTimes, isLeaveCancelled } from "@/lib/cancellation";
import { fetchDirectRequests } from "@/lib/direct-fetch";
import { dedupeLeaves, type DedupableRow } from "@/lib/dedupe";
import { LEAVE_MAIL_QUERY } from "@/lib/gmail-window";
import { createLedger } from "@/lib/quota";
import { noteGmailFailure, readBreaker } from "@/lib/gmail-breaker";
import { cachedIdsSince, resolveWindowRefs } from "@/lib/cached-window";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_MESSAGES = 500;
const BATCH_SIZE = 40;
const STATS_SINCE = process.env.STATS_SINCE ?? "2026/08/01";

function statsSinceMs(): number {
  const parsed = Date.parse(STATS_SINCE);
  return Number.isNaN(parsed) ? 0 : parsed;
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

  const ledger = createLedger(user);
  const breaker = await readBreaker(user);
  const skipGmail = breaker !== null;

  const sinceMs = statsSinceMs();

  try {
    const gmail = getGmail(client);
    const [profile, decisions, team, mailCache, directory, syncState] =
      await Promise.all([
        skipGmail
          ? Promise.resolve(null)
          : gmail.users.getProfile({ userId: "me" }).then(async (res) => {
              await ledger.charge("getProfile");
              return res;
            }),
        loadDecisions(user),
        loadTeam(user),
        loadMailCache(user),
        loadEmployees(),
        loadSyncState(user, "stats"),
      ]);

    const selfEmail = profile?.data.emailAddress ?? "";
    const historyId = normalizeHistoryId(profile?.data.historyId);
    const cachedIds = cachedIdsSince(mailCache.entries, sinceMs, MAX_MESSAGES);
    const nowMs = Date.now();

    const sync = skipGmail
      ? { scan: false }
      : await decideSync(
          syncState,
          { historyId, sinceMs, nowMs, cachedCount: cachedIds.length },
          async (startHistoryId) => {
            if (!(await ledger.afford("history.list"))) return null;
            const probed = await gmail.users.history.list({
              userId: "me",
              startHistoryId,
              historyTypes: ["messageAdded"],
            });
            return probed.data;
          }
        );

    let list = { data: {} as gmail_v1.Schema$ListMessagesResponse };
    if (sync.scan && (await ledger.afford("messages.list"))) {
      list = await gmail.users.messages.list({
        userId: "me",
        q: `${LEAVE_MAIL_QUERY} after:${STATS_SINCE}`,
        maxResults: MAX_MESSAGES,
      });
    }

    const listedIds = [
      ...new Set(
        (list.data.messages ?? [])
          .map((m) => m.id)
          .filter((id): id is string => Boolean(id))
      ),
    ];
    const capped = sync.scan && listedIds.length >= MAX_MESSAGES;
    const ids = resolveWindowRefs({
      scan: sync.scan,
      degraded: ledger.exhausted,
      listed: listedIds.map((id) => ({ id })),
      cachedIds,
      entries: mailCache.entries,
      cap: MAX_MESSAGES,
    }).map((r) => r.id);

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

    let persisted = mailCache;
    if (cached > 0) {
      persisted = pruneMailCache(mailCache, Date.now());
      await saveMailCache(user, persisted);
    }

    const parsedRows = ids
      .map((id) => {
        const entry = mailCache.entries[id];
        if (!entry?.m) return null;
        return {
          id,
          parsed: entry.m,
          receivedMs: entry.t,
          status: decisions[id]?.status ?? "pending",
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    // A leave whose cancellation has been approved was not actually taken.
    const cancelled = cancelledLeaveTimes(
      parsedRows.map((r) => ({
        employeeCode: r.parsed.employeeCode,
        fromDate: r.parsed.fromDate,
        toDate: r.parsed.toDate,
        status: r.status,
        kind: r.parsed.kind,
        receivedAt: r.receivedMs,
      }))
    );

    const direct = skipGmail
      ? []
      : await fetchDirectRequests(gmail, user, STATS_SINCE, {
          selfEmail,
          team,
          decisions,
          skipIds: new Set(ids),
          ledger,
        });

    const dedupeInput: DedupableRow[] = [
      ...parsedRows.map((r) => ({
        id: r.id,
        employeeCode: r.parsed.employeeCode,
        fromDate: r.parsed.fromDate,
        toDate: r.parsed.toDate,
        status: r.status,
        kind: r.parsed.kind,
        receivedAt: new Date(r.receivedMs).toISOString(),
      })),
      ...direct
        .filter((r) => !r.needsReview)
        .map((r) => ({
          id: r.id,
          employeeCode: r.employeeCode,
          fromDate: r.fromDate,
          toDate: r.toDate,
          status: r.status,
          kind: r.kind,
          source: r.source,
          receivedAt: r.receivedAt,
        })),
    ];
    const keptIds = new Set(dedupeLeaves(dedupeInput).map((r) => r.id));

    const entries: StatsEntry[] = [];
    for (const r of parsedRows) {
      if (!keptIds.has(r.id)) continue;
      // Cancellation requests are not leaves taken; keep them out of stats.
      if (r.parsed.kind === "cancellation") continue;
      // Neither is a leave the employee later cancelled.
      if (isLeaveCancelled({ ...r.parsed, receivedAt: r.receivedMs }, cancelled))
        continue;
      if (isWithdrawn(r)) continue;
      entries.push({
        id: r.id,
        employeeName: r.parsed.employeeName,
        employeeCode: r.parsed.employeeCode,
        leaveType: r.parsed.leaveType,
        numberOfDays: r.parsed.numberOfDays,
        fromDate: r.parsed.fromDate,
        toDate: r.parsed.toDate,
        receivedAt: new Date(r.receivedMs).toISOString(),
        status: r.status,
      });
    }

    for (const r of direct) {
      if (r.needsReview) continue;
      if (!keptIds.has(r.id)) continue;
      if (r.kind === "cancellation") continue;
      if (isLeaveCancelled(r, cancelled)) continue;
      if (isWithdrawn(r)) continue;
      entries.push({
        id: r.id,
        employeeName: r.employeeName,
        employeeCode: r.employeeCode,
        leaveType: r.leaveType,
        numberOfDays: r.numberOfDays,
        fromDate: r.fromDate,
        toDate: r.toDate,
        receivedAt: r.receivedAt,
        status: r.status,
      });
    }

    const nextSync = syncStateToStore({
      scanned: sync.scan,
      skipped: skipGmail,
      exhausted: ledger.exhausted,
      capped,
      ids,
      cached: persisted.entries,
      historyId,
      sinceMs,
      nowMs,
      previous: syncState,
    });
    if (nextSync) await saveSyncState(user, "stats", nextSync);

    // Count only people on the manager's team (all, if no team is configured).
    return NextResponse.json({
      ...aggregateStatsForTeam(entries, team),
      roster: teamRoster(team, directory),
      ...(breaker
        ? { partial: true as const, retryAtMs: breaker.retryAt }
        : ledger.exhausted
          ? { partial: true as const, retryAtMs: ledger.resetAtMs }
          : {}),
    });
  } catch (e) {
    const tripped = await noteGmailFailure(user, e);
    if (tripped) {
      return NextResponse.json(
        { error: "gmail_rate_limited", retryAtMs: tripped.retryAt },
        { status: 503, headers: { "Retry-After": String(
          Math.max(1, Math.ceil((tripped.retryAt - Date.now()) / 1000))
        ) } }
      );
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "gmail_error" },
      { status: 500 }
    );
  }
}
