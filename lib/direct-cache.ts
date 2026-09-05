import type { gmail_v1 } from "@googleapis/gmail";
import { MAX_BODY_CHARS as CLASSIFY_MAX_BODY_CHARS } from "./classify";
import type { DirectMail } from "./direct";
import { extractBodyText } from "./parser";

export const DIRECT_CACHE_VERSION = 1;
export const DIRECT_CACHE_MAX_ENTRIES = 250;
export const DIRECT_CACHE_MAX_AGE_MS = 400 * 24 * 60 * 60 * 1000;
export const DIRECT_CACHE_MAX_BYTES = 700_000;
export const DIRECT_CACHE_MAX_BODY_CHARS = CLASSIFY_MAX_BODY_CHARS;
export const DIRECT_CACHE_MAX_SUBJECT_CHARS = 200;
export const DIRECT_CACHE_MAX_FROM_CHARS = 200;
export const DIRECT_CACHE_MAX_RECIPIENTS = 25;

export interface CachedDirectMail {
  threadId: string;
  subject: string;
  bodyText: string;
  senderEmail: string;
  recipients: string[];
  from: string;
}

export interface DirectCacheEntry {
  t: number;
  m: CachedDirectMail | null;
}

export interface DirectCache {
  v: number;
  entries: Record<string, DirectCacheEntry>;
}

export interface DirectCachePartition {
  known: string[];
  missing: string[];
}

export function emptyDirectCache(): DirectCache {
  return { v: DIRECT_CACHE_VERSION, entries: {} };
}

function isEntry(value: unknown): value is DirectCacheEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<DirectCacheEntry>;
  if (typeof entry.t !== "number" || !Number.isFinite(entry.t)) return false;
  if (entry.m === null) return true;
  return Boolean(entry.m) && typeof entry.m === "object";
}

export function readDirectCache(raw: unknown): DirectCache {
  if (!raw || typeof raw !== "object") return emptyDirectCache();
  const blob = raw as Partial<DirectCache>;
  if (blob.v !== DIRECT_CACHE_VERSION) return emptyDirectCache();
  if (!blob.entries || typeof blob.entries !== "object") {
    return emptyDirectCache();
  }

  const entries: Record<string, DirectCacheEntry> = {};
  for (const [id, value] of Object.entries(blob.entries)) {
    if (!id || !isEntry(value)) continue;
    entries[id] = value;
  }
  return { v: DIRECT_CACHE_VERSION, entries };
}

export function partitionDirectCached(
  ids: string[],
  cache: DirectCache,
): DirectCachePartition {
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

function header(msg: gmail_v1.Schema$Message, name: string): string {
  const wanted = name.toLowerCase();
  return (
    msg.payload?.headers?.find((h) => h.name?.toLowerCase() === wanted)
      ?.value ?? ""
  );
}

function addresses(value: string): string[] {
  return value.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g) ?? [];
}

export function directCacheEntryFromMessage(
  msg: gmail_v1.Schema$Message,
  nowMs: number = Date.now(),
): DirectCacheEntry {
  const stamped = msg.internalDate ? parseInt(msg.internalDate) : Number.NaN;
  const t = Number.isFinite(stamped) ? stamped : nowMs;

  const from = header(msg, "From");
  const senderEmail = addresses(from)[0]?.toLowerCase() ?? "";
  if (!senderEmail) return { t, m: null };

  return {
    t,
    m: {
      threadId: msg.threadId ?? "",
      subject: clip(header(msg, "Subject"), DIRECT_CACHE_MAX_SUBJECT_CHARS),
      bodyText: clip(extractBodyText(msg), DIRECT_CACHE_MAX_BODY_CHARS),
      senderEmail,
      recipients: [
        ...addresses(header(msg, "To")),
        ...addresses(header(msg, "Cc")),
      ].slice(0, DIRECT_CACHE_MAX_RECIPIENTS),
      from: clip(from, DIRECT_CACHE_MAX_FROM_CHARS),
    },
  };
}

export function buildDirectMail(
  id: string,
  entry: DirectCacheEntry,
  selfEmail: string,
): DirectMail | null {
  const mail = entry.m;
  if (!mail) return null;

  return {
    id,
    threadId: mail.threadId,
    subject: mail.subject,
    bodyText: mail.bodyText,
    receivedAt: new Date(entry.t).toISOString(),
    senderEmail: mail.senderEmail,
    recipients: mail.recipients,
    selfEmail,
  };
}

function entryBytes(id: string, entry: DirectCacheEntry): number {
  return JSON.stringify(entry).length + id.length + 4;
}

export function pruneDirectCache(
  cache: DirectCache,
  nowMs: number,
): DirectCache {
  const fresh = Object.entries(cache.entries).filter(
    ([, entry]) => nowMs - entry.t <= DIRECT_CACHE_MAX_AGE_MS,
  );
  fresh.sort((a, b) => b[1].t - a[1].t);

  const entries: Record<string, DirectCacheEntry> = {};
  let bytes = 0;
  let count = 0;
  for (const [id, entry] of fresh) {
    if (count >= DIRECT_CACHE_MAX_ENTRIES) break;
    const size = entryBytes(id, entry);
    if (bytes + size > DIRECT_CACHE_MAX_BYTES) continue;
    entries[id] = entry;
    bytes += size;
    count += 1;
  }

  return { v: DIRECT_CACHE_VERSION, entries };
}
