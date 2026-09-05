import type { ParsedLeaveMail } from "./parser";
import type { Decision, LeaveKind, LeaveRequest } from "./types";

export const MAIL_CACHE_VERSION = 1;
export const MAIL_CACHE_MAX_ENTRIES = 3000;
export const MAIL_CACHE_MAX_AGE_MS = 400 * 24 * 60 * 60 * 1000;
export const MAIL_CACHE_MAX_BYTES = 700_000;
export const MAIL_CACHE_MAX_REASON_CHARS = 500;
export const MAIL_CACHE_MAX_BODY_CHARS = 1200;

export interface CachedMail {
  threadId: string;
  bodyText: string;
  employeeName: string;
  employeeCode: string;
  employeeEmail: string;
  leaveType: string;
  fromDate: string;
  toDate: string;
  numberOfDays: number;
  reason: string;
  leaveBalance: string;
  fromSession: string;
  toSession: string;
  ccRecipients: string[];
  kind: LeaveKind;
}

export interface MailCacheEntry {
  t: number;
  m: CachedMail | null;
}

export interface MailCache {
  v: number;
  entries: Record<string, MailCacheEntry>;
}

export interface CachePartition {
  known: string[];
  missing: string[];
}

export function emptyMailCache(): MailCache {
  return { v: MAIL_CACHE_VERSION, entries: {} };
}

function isEntry(value: unknown): value is MailCacheEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<MailCacheEntry>;
  if (typeof entry.t !== "number" || !Number.isFinite(entry.t)) return false;
  if (entry.m === null) return true;
  return Boolean(entry.m) && typeof entry.m === "object";
}

export function readMailCache(raw: unknown): MailCache {
  if (!raw || typeof raw !== "object") return emptyMailCache();
  const blob = raw as Partial<MailCache>;
  if (blob.v !== MAIL_CACHE_VERSION) return emptyMailCache();
  if (!blob.entries || typeof blob.entries !== "object") return emptyMailCache();

  const entries: Record<string, MailCacheEntry> = {};
  for (const [id, value] of Object.entries(blob.entries)) {
    if (!id || !isEntry(value)) continue;
    entries[id] = value;
  }
  return { v: MAIL_CACHE_VERSION, entries };
}

export function partitionCached(
  ids: string[],
  cache: MailCache,
): CachePartition {
  const known: string[] = [];
  const missing: string[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    if (cache.entries[id]) known.push(id);
    else missing.push(id);
  }
  return { known, missing };
}

function clip(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

export function cacheEntryFromParsed(
  parsed: ParsedLeaveMail | null,
  receivedMs: number,
  threadId: string,
  bodyText: string,
): MailCacheEntry {
  const t = Number.isFinite(receivedMs) ? receivedMs : Date.now();
  if (!parsed) return { t, m: null };

  return {
    t,
    m: {
      threadId,
      bodyText: clip(bodyText, MAIL_CACHE_MAX_BODY_CHARS),
      employeeName: parsed.employeeName,
      employeeCode: parsed.employeeCode,
      employeeEmail: parsed.employeeEmail,
      leaveType: parsed.leaveType,
      fromDate: parsed.fromDate,
      toDate: parsed.toDate,
      numberOfDays: parsed.numberOfDays,
      reason: clip(parsed.reason, MAIL_CACHE_MAX_REASON_CHARS),
      leaveBalance: parsed.leaveBalance,
      fromSession: parsed.fromSession,
      toSession: parsed.toSession,
      ccRecipients: parsed.ccRecipients,
      kind: parsed.kind,
    },
  };
}

export function buildLeaveRequest(
  id: string,
  entry: MailCacheEntry,
  employees: Record<string, { email: string }>,
  decisions: Record<string, Decision>,
): LeaveRequest | null {
  const mail = entry.m;
  if (!mail) return null;

  const directoryEntry = employees[mail.employeeCode.toUpperCase()];
  const decision = decisions[id];

  return {
    id,
    threadId: mail.threadId,
    employeeName: mail.employeeName,
    employeeCode: mail.employeeCode,
    employeeEmail: directoryEntry?.email ?? mail.employeeEmail,
    leaveType: mail.leaveType,
    fromDate: mail.fromDate,
    toDate: mail.toDate,
    numberOfDays: mail.numberOfDays,
    reason: mail.reason,
    leaveBalance: mail.leaveBalance,
    fromSession: mail.fromSession,
    toSession: mail.toSession,
    ccRecipients: mail.ccRecipients,
    kind: mail.kind,
    emailVerified: Boolean(directoryEntry),
    bodyText: mail.bodyText,
    receivedAt: new Date(entry.t).toISOString(),
    status: decision?.status ?? "pending",
    decidedAt: decision?.decidedAt,
    decisionNote: decision?.note,
    mailSent: Boolean(decision?.sentTo),
  };
}

function entryBytes(id: string, entry: MailCacheEntry): number {
  return JSON.stringify(entry).length + id.length + 4;
}

export function pruneMailCache(cache: MailCache, nowMs: number): MailCache {
  const fresh = Object.entries(cache.entries).filter(
    ([, entry]) => nowMs - entry.t <= MAIL_CACHE_MAX_AGE_MS,
  );
  fresh.sort((a, b) => b[1].t - a[1].t);

  const entries: Record<string, MailCacheEntry> = {};
  let bytes = 0;
  let count = 0;
  for (const [id, entry] of fresh) {
    if (count >= MAIL_CACHE_MAX_ENTRIES) break;
    const size = entryBytes(id, entry);
    if (bytes + size > MAIL_CACHE_MAX_BYTES) continue;
    entries[id] = entry;
    bytes += size;
    count += 1;
  }

  return { v: MAIL_CACHE_VERSION, entries };
}
