import { NextRequest, NextResponse } from "next/server";
import type { gmail_v1 } from "@googleapis/gmail";
import { getAuthorizedClient, getGmail } from "@/lib/google";
import { getUserFromRequest } from "@/lib/session";
import { parseLeaveMail } from "@/lib/parser";
import { loadEmployees } from "@/lib/employees";
import { loadTeam, saveTeam } from "@/lib/store";
import { gmailAfterDate, monthStart } from "@/lib/history";

export const dynamic = "force-dynamic";

const SEARCH_QUERY =
  process.env.LEAVE_MAIL_QUERY ??
  'from:no-reply@greythr.com subject:"Leave Application from"';

const MAX_MESSAGES = 500;
const BATCH_SIZE = 40;
// How far back to look when discovering who appears in your leave mails.
const DISCOVER_MONTHS = 6;

interface DiscoveredPerson {
  code: string;
  name: string;
  email: string;
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

  try {
    const gmail = getGmail(client);
    const [profile, list, team, employees] = await Promise.all([
      gmail.users.getProfile({ userId: "me" }),
      gmail.users.messages.list({
        userId: "me",
        q: `${SEARCH_QUERY} after:${gmailAfterDate(since)}`,
        maxResults: MAX_MESSAGES,
      }),
      loadTeam(user),
      loadEmployees(),
    ]);

    const selfEmail = profile.data.emailAddress ?? "";
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
      const code = emp.code?.toUpperCase();
      if (code) byCode.set(code, { code, name: emp.name, email: emp.email });
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
          name: parsed.employeeName,
          email: parsed.employeeEmail,
        });
      }
    }

    const discovered = [...byCode.values()].sort((a, b) =>
      a.name.localeCompare(b.name)
    );

    return NextResponse.json({ team, discovered });
  } catch (e) {
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

  let codes: string[];
  try {
    const body = await req.json();
    codes = Array.isArray(body.codes) ? body.codes : [];
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  await saveTeam(user, codes);
  const saved = await loadTeam(user);
  return NextResponse.json({ ok: true, count: saved.length });
}
