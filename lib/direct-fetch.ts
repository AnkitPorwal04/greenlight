import type { gmail_v1 } from "@googleapis/gmail";
import { classifyMail } from "./classify";
import type {
  Classifier,
  ClassifyInput,
  ClassifyMeta,
  DirectClassification,
} from "./classify";
import {
  buildDirectQueries,
  classificationToRequest,
  withDecision,
} from "./direct";
import type { DirectMail, DirectPerson } from "./direct";
import {
  buildDirectMail,
  directCacheEntryFromMessage,
  partitionDirectCached,
  pruneDirectCache,
} from "./direct-cache";
import { loadEmployees } from "./employees";
import {
  loadClassification,
  loadDirectCache,
  loadDismissed,
  saveClassification,
  saveDirectCache,
} from "./store";
import { filterByTeam, teamCodeSet } from "./team";
import type { Decision, LeaveRequest } from "./types";
import { collectMessageRefs, GMAIL_PAGE_SIZE } from "./gmail-window";
import type { QuotaLedger } from "./quota";

export const DIRECT_MAX_MESSAGES = 100;
export const DIRECT_BATCH_SIZE = 25;
export const DIRECT_MAX_NEW_CLASSIFICATIONS = 40;
export const DIRECT_CLASSIFY_BUDGET_MS = 45000;
export const DIRECT_CLASSIFY_CHUNK_SIZE = 5;

export interface DirectFetchContext {
  selfEmail: string;
  team: string[];
  decisions: Record<string, Decision>;
  skipIds?: Set<string>;
  ledger?: QuotaLedger;
}

export interface ClassifyJob {
  id: string;
  input: ClassifyInput;
}

export interface BurstOptions {
  budgetMs?: number;
  maxNew?: number;
  chunkSize?: number;
  now?: () => number;
}

export type SaveClassification = (
  id: string,
  classification: DirectClassification
) => Promise<void>;

interface DirectCandidate {
  person: DirectPerson;
  mail: DirectMail;
  from: string;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

export async function classifyInBursts(
  jobs: ClassifyJob[],
  classify: Classifier,
  save: SaveClassification,
  options: BurstOptions = {}
): Promise<Map<string, DirectClassification>> {
  const budgetMs = options.budgetMs ?? DIRECT_CLASSIFY_BUDGET_MS;
  const maxNew = options.maxNew ?? DIRECT_MAX_NEW_CLASSIFICATIONS;
  const chunkSize = Math.max(1, options.chunkSize ?? DIRECT_CLASSIFY_CHUNK_SIZE);
  const now = options.now ?? Date.now;

  const answers = new Map<string, DirectClassification>();
  const startedAt = now();

  const batches = chunk(jobs.slice(0, maxNew), chunkSize);

  for (let b = 0; b < batches.length; b += 1) {
    if (b > 0 && now() - startedAt > budgetMs) break;

    const batch = batches[b];
    const metas: ClassifyMeta[] = batch.map(() => ({}));
    const results = await Promise.all(
      batch.map((job, i) => classify(job.input, metas[i]).catch(() => null))
    );

    const done: ClassifyJob[] = [];
    for (let i = 0; i < batch.length; i += 1) {
      const result = results[i];
      if (!result) continue;
      answers.set(batch[i].id, result);
      done.push(batch[i]);
    }

    await Promise.all(
      done.map((job) => save(job.id, answers.get(job.id)!))
    );

    if (done.length === 0) break;
    if (metas.some((meta) => meta.rateLimited)) break;
  }

  return answers;
}

function directoryByEmail(
  employees: Record<string, { code: string; name: string; email: string }>,
  team: string[]
): Map<string, DirectPerson> {
  const codes = teamCodeSet(team);
  const byEmail = new Map<string, DirectPerson>();
  for (const person of Object.values(employees)) {
    const email = person.email?.trim().toLowerCase();
    if (!email) continue;
    if (codes.size && !codes.has(person.code.trim().toUpperCase())) continue;
    byEmail.set(email, {
      code: person.code.trim().toUpperCase(),
      name: person.name,
      email,
    });
  }
  return byEmail;
}

export async function fetchDirectRequests(
  gmail: gmail_v1.Gmail,
  user: string,
  afterYmd: string,
  ctx: DirectFetchContext
): Promise<LeaveRequest[]> {
  if (!process.env.GEMINI_API_KEY?.trim()) return [];

  try {
    const [employees, dismissed] = await Promise.all([
      loadEmployees(),
      loadDismissed(user),
    ]);

    const byEmail = directoryByEmail(employees, ctx.team);
    if (byEmail.size === 0) return [];

    const queries = buildDirectQueries([...byEmail.keys()], afterYmd);
    if (queries.length === 0) return [];

    const ledger = ctx.ledger;

    const seen = new Set<string>();
    const refs: { id: string; threadId?: string }[] = [];
    for (const q of queries) {
      if (refs.length >= DIRECT_MAX_MESSAGES) break;
      if (ledger?.exhausted) break;
      const page = await collectMessageRefs(
        DIRECT_MAX_MESSAGES - refs.length,
        async (pageToken) => {
          if (ledger && !(await ledger.afford("messages.list"))) {
            return { refs: [] };
          }
          const listed = await gmail.users.messages.list({
            userId: "me",
            q,
            maxResults: GMAIL_PAGE_SIZE,
            pageToken,
          });
          return {
            refs: (listed.data.messages ?? []).map((m) => ({
              id: m.id ?? "",
              threadId: m.threadId ?? undefined,
            })),
            nextPageToken: listed.data.nextPageToken ?? undefined,
          };
        }
      );
      for (const ref of page.refs) {
        if (!ref.id || seen.has(ref.id)) continue;
        seen.add(ref.id);
        refs.push(ref);
      }
    }

    const skip = ctx.skipIds ?? new Set<string>();
    const dropped = new Set(dismissed);
    const wanted = refs.filter((r) => !skip.has(r.id) && !dropped.has(r.id));
    if (wanted.length === 0) return [];

    const mailCache = await loadDirectCache(user);
    const { missing } = partitionDirectCached(
      wanted.map((r) => r.id),
      mailCache
    );

    let added = 0;
    for (const batch of chunk(missing, DIRECT_BATCH_SIZE)) {
      if (ledger && !(await ledger.afford("messages.get", batch.length))) break;
      const fetched = await Promise.allSettled(
        batch.map((id) =>
          gmail.users.messages.get({ userId: "me", id, format: "full" })
        )
      );
      fetched.forEach((res, i) => {
        if (res.status !== "fulfilled") return;
        const msg = res.value.data;
        const id = msg.id ?? batch[i];
        if (!id) return;
        mailCache.entries[id] = directCacheEntryFromMessage(msg);
        added += 1;
      });
    }

    if (added > 0) {
      await saveDirectCache(user, pruneDirectCache(mailCache, Date.now()));
    }

    const self = ctx.selfEmail.trim().toLowerCase();
    const cachedRefs = wanted
      .map((ref) => ({ id: ref.id, entry: mailCache.entries[ref.id] }))
      .filter((row) => Boolean(row.entry));
    cachedRefs.sort((a, b) => b.entry.t - a.entry.t);

    const candidates: DirectCandidate[] = [];
    for (const row of cachedRefs) {
      const mail = buildDirectMail(row.id, row.entry, self);
      if (!mail) continue;

      const person = byEmail.get(mail.senderEmail);
      if (!person || mail.senderEmail === self) continue;

      candidates.push({ person, mail, from: row.entry.m!.from });
    }
    if (candidates.length === 0) return [];

    const cached = await Promise.all(
      candidates.map((c) => loadClassification(user, c.mail.id))
    );

    const answers = new Map<string, DirectClassification>();
    candidates.forEach((c, i) => {
      const hit = cached[i];
      if (hit) answers.set(c.mail.id, hit);
    });

    const pending = candidates.filter((c) => !answers.has(c.mail.id));
    const fresh = await classifyInBursts(
      pending.map((c) => ({
        id: c.mail.id,
        input: {
          subject: c.mail.subject,
          from: c.from,
          bodyText: c.mail.bodyText,
          receivedAt: c.mail.receivedAt,
        },
      })),
      classifyMail,
      (id, classification) => saveClassification(user, id, classification)
    );
    for (const [id, classification] of fresh) answers.set(id, classification);

    const rows: LeaveRequest[] = [];
    for (const c of candidates) {
      const classification = answers.get(c.mail.id);
      if (!classification) continue;

      const request = classificationToRequest(c.mail, c.person, classification);
      if (!request) continue;

      rows.push(withDecision(request, ctx.decisions[c.mail.id]));
    }

    return filterByTeam(rows, ctx.team);
  } catch {
    return [];
  }
}
