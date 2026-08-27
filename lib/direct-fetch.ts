import type { gmail_v1 } from "@googleapis/gmail";
import { classifyMail } from "./classify";
import { buildDirectQueries, classificationToRequest } from "./direct";
import type { DirectPerson } from "./direct";
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
export const DIRECT_MAX_NEW_CLASSIFICATIONS = 6;
export const DIRECT_CLASSIFY_BUDGET_MS = 20000;
const MAX_CLASSIFY_FAILURES = 2;

export interface DirectFetchContext {
  selfEmail: string;
  team: string[];
  decisions: Record<string, Decision>;
  skipIds?: Set<string>;
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
    const startedAt = Date.now();
    let classified = 0;
    let failures = 0;
    const rows: LeaveRequest[] = [];

    for (const msg of messages) {
      const id = msg.id ?? "";
      if (!id) continue;

      const senderEmail = addresses(header(msg, "From"))[0]?.toLowerCase() ?? "";
      const person = byEmail.get(senderEmail);
      if (!person || senderEmail === self) continue;

      const bodyText = extractBodyText(msg);
      const subject = header(msg, "Subject");
      const receivedAt = new Date(
        msg.internalDate ? parseInt(msg.internalDate) : Date.now()
      ).toISOString();

      let classification = await loadClassification(user, id);
      if (!classification) {
        if (failures >= MAX_CLASSIFY_FAILURES) continue;
        if (classified >= DIRECT_MAX_NEW_CLASSIFICATIONS) continue;
        if (Date.now() - startedAt > DIRECT_CLASSIFY_BUDGET_MS) continue;

        classified += 1;
        classification = await classifyMail({
          subject,
          from: header(msg, "From"),
          bodyText,
          receivedAt,
        });
        if (!classification) {
          failures += 1;
          continue;
        }
        await saveClassification(user, id, classification);
      }

      const request = classificationToRequest(
        {
          id,
          threadId: msg.threadId ?? "",
          subject,
          bodyText,
          receivedAt,
          senderEmail,
          recipients: [
            ...addresses(header(msg, "To")),
            ...addresses(header(msg, "Cc")),
          ],
          selfEmail: self,
        },
        person,
        classification
      );
      if (!request) continue;

      const decision = ctx.decisions[id];
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
