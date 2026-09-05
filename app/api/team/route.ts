import { NextRequest, NextResponse } from "next/server";
import type { gmail_v1 } from "@googleapis/gmail";
import { getAuthorizedClient, getGmail } from "@/lib/google";
import { getUserFromRequest } from "@/lib/session";
import { parseLeaveMail } from "@/lib/parser";
import { loadEmployees } from "@/lib/employees";
import { loadTeam, loadTeamName, saveTeam, saveTeamName } from "@/lib/store";
import { managerDisplayName } from "@/lib/team-name";
import { gmailAfterDate, monthStart } from "@/lib/history";
import { LEAVE_MAIL_QUERY } from "@/lib/gmail-window";
import { createLedger } from "@/lib/quota";
import { noteGmailFailure, readBreaker } from "@/lib/gmail-breaker";

export const dynamic = "force-dynamic";

const MAX_MESSAGES = 500;
const BATCH_SIZE = 40;
// How far back to look when discovering who appears in your leave mails.
const DISCOVER_MONTHS = 6;

interface DiscoveredPerson {
  code: string;
  name: string;
  email: string;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
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

  const since = monthStart(new Date(), DISCOVER_MONTHS - 1);

  const ledger = createLedger(user);
  const breaker = await readBreaker(user);
  const skipGmail = breaker !== null;

  try {
    const gmail = getGmail(client);
    const [profile, list, team, teamName, employees] = await Promise.all([
      skipGmail
        ? Promise.resolve(null)
        : gmail.users.getProfile({ userId: "me" }).then(async (res) => {
            await ledger.charge("getProfile");
            return res;
          }),
      skipGmail
        ? Promise.resolve({ data: {} as gmail_v1.Schema$ListMessagesResponse })
        : ledger.afford("messages.list").then((ok) =>
            ok
              ? gmail.users.messages.list({
                  userId: "me",
                  q: `${LEAVE_MAIL_QUERY} after:${gmailAfterDate(since)}`,
                  maxResults: MAX_MESSAGES,
                })
              : { data: {} as gmail_v1.Schema$ListMessagesResponse }
          ),
      loadTeam(user),
      loadTeamName(user),
      loadEmployees(),
    ]);

    const selfEmail = profile?.data.emailAddress ?? "";
    const ids = [
      ...new Set(
        (list.data.messages ?? [])
          .map((m) => m.id)
          .filter((id): id is string => Boolean(id))
      ),
    ];

    // Metadata-only fetch is enough to read the applicant's name/code (from the
    // subject) and the recipients (for a guessed email), and is far lighter than
    // pulling the full message body for every mail.
    // Discovery is best-effort, so skip any single message that fails to fetch
    // rather than failing the whole request.
    const messages: gmail_v1.Schema$Message[] = [];
    for (const batch of chunk(ids, BATCH_SIZE)) {
      if (!(await ledger.afford("messages.get", batch.length))) break;
      const fetched = await Promise.allSettled(
        batch.map((id) =>
          gmail.users.messages.get({
            userId: "me",
            id,
            format: "metadata",
            metadataHeaders: ["Subject", "To", "Cc"],
          })
        )
      );
      for (const res of fetched) {
        if (res.status === "fulfilled") messages.push(res.value.data);
      }
    }

    // Start from the whole saved directory (the authoritative roster), so
    // everyone you loaded into it is selectable even if they have not applied
    // for leave recently.
    const byCode = new Map<string, DiscoveredPerson>();
    for (const emp of Object.values(employees)) {
      const code = text(emp.code).toUpperCase();
      if (code) {
        byCode.set(code, {
          code,
          name: text(emp.name),
          email: text(emp.email).toLowerCase(),
        });
      }
    }

    // Then add anyone who appears in your recent leave mails but is not yet in
    // the directory, so nobody is missed.
    for (const msg of messages) {
      const parsed = parseLeaveMail(msg, selfEmail);
      if (!parsed || !parsed.employeeCode) continue;
      const code = parsed.employeeCode.toUpperCase();
      if (!byCode.has(code)) {
        byCode.set(code, {
          code,
          name: text(parsed.employeeName),
          email: text(parsed.employeeEmail).toLowerCase(),
        });
      }
    }

    const discovered = [...byCode.values()].sort((a, b) =>
      a.name.localeCompare(b.name)
    );

    const manager = {
      name: managerDisplayName(user, Object.values(employees)),
      email: user,
    };

    return NextResponse.json({
      team,
      teamName,
      discovered,
      manager,
      ...(breaker
        ? { partial: true as const, retryAtMs: breaker.retryAt }
        : ledger.exhausted
          ? { partial: true as const, retryAtMs: ledger.resetAtMs }
          : {}),
    });
  } catch (e) {
    await noteGmailFailure(user, e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "gmail_error" },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  const user = getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "not_connected" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    const parsed = await req.json();
    body = parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (Array.isArray(body.codes)) {
    await saveTeam(user, body.codes as string[]);
  }
  if (typeof body.teamName === "string") {
    await saveTeamName(user, body.teamName);
  }

  const [saved, teamName] = await Promise.all([
    loadTeam(user),
    loadTeamName(user),
  ]);
  return NextResponse.json({ ok: true, count: saved.length, teamName });
}
