import type { gmail_v1 } from "@googleapis/gmail";
import { classifyMail } from "./classify";
import type {
  Classifier,
  ClassifyInput,
  ClassifyMeta,
  DirectClassification,
} from "./classify";
import { buildDirectQueries, classificationToRequest } from "./direct";
import type { DirectMail, DirectPerson } from "./direct";
import { loadEmployees } from "./employees";
import { extractBodyText } from "./parser";
import {
  loadClassification,
  loadDismissed,
  saveClassification,
} from "./store";
import { filterByTeam, teamCodeSet } from "./team";
import type { Decision, LeaveRequest } from "./types";
import { collectMessageRefs, GMAIL_PAGE_SIZE } from "./gmail-window";

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

function header(msg: gmail_v1.Schema$Message, name: string): string {
  return (
    msg.payload?.headers?.find(
      (h) => h.name?.toLowerCase() === name.toLowerCase()
    )?.value ?? ""
  );
}

function addresses(value: string): string[] {
  return value.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g) ?? [];
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

    const seen = new Set<string>();
    const refs: { id: string; threadId?: string }[] = [];
    for (const q of queries) {
      if (refs.length >= DIRECT_MAX_MESSAGES) break;
      const page = await collectMessageRefs(
        DIRECT_MAX_MESSAGES - refs.length,
        async (pageToken) => {
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

    const messages: gmail_v1.Schema$Message[] = [];
    for (const batch of chunk(wanted, DIRECT_BATCH_SIZE)) {
      const fetched = await Promise.allSettled(
        batch.map((ref) =>
          gmail.users.messages.get({ userId: "me", id: ref.id, format: "full" })
        )
      );
      for (const res of fetched) {
        if (res.status === "fulfilled") messages.push(res.value.data);
      }
    }

    messages.sort(
      (a, b) => Number(b.internalDate ?? 0) - Number(a.internalDate ?? 0)
    );

    const self = ctx.selfEmail.trim().toLowerCase();
    const candidates: DirectCandidate[] = [];

    for (const msg of messages) {
      const id = msg.id ?? "";
      if (!id) continue;

      const from = header(msg, "From");
      const senderEmail = addresses(from)[0]?.toLowerCase() ?? "";
      const person = byEmail.get(senderEmail);
      if (!person || senderEmail === self) continue;

      candidates.push({
        person,
        mail: {
          id,
          threadId: msg.threadId ?? "",
          subject: header(msg, "Subject"),
          bodyText: extractBodyText(msg),
          receivedAt: new Date(
            msg.internalDate ? parseInt(msg.internalDate) : Date.now()
          ).toISOString(),
          senderEmail,
          recipients: [
            ...addresses(header(msg, "To")),
            ...addresses(header(msg, "Cc")),
          ],
          selfEmail: self,
        },
        from,
      });
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

      const decision = ctx.decisions[c.mail.id];
      rows.push({
        ...request,
        status: decision?.status ?? "pending",
        decidedAt: decision?.decidedAt,
        decisionNote: decision?.note,
        mailSent: Boolean(decision?.sentTo),
      });
    }

    return filterByTeam(rows, ctx.team);
  } catch {
    return [];
  }
}
