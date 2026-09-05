import { gmailAfterDate, monthStart } from "./history";

// Matches greytHR leave application AND leave cancellation mails. Overridable
// via LEAVE_MAIL_QUERY for other HR systems. Kept narrow (both are subject-
// specific) so unrelated greytHR mail is not pulled in.
export const LEAVE_MAIL_QUERY =
  process.env.LEAVE_MAIL_QUERY ??
  'from:no-reply@greythr.com (subject:"Leave Application from" OR subject:cancellation)';

export const SENT_MAIL_QUERY = "from:me";

export const LEAVES_MAX_MESSAGES = 500;
export const HISTORY_MAX_MESSAGES = 1000;
export const CALENDAR_MAX_MESSAGES = 1000;
export const SENT_PROBE_MAX_MESSAGES = 2000;
export const GMAIL_PAGE_SIZE = 100;

export const CALENDAR_MONTHS_BACK = 6;

export interface MessageRef {
  id: string;
  threadId?: string;
}

export interface MessageRefPage {
  refs: MessageRef[];
  nextPageToken?: string;
}

export interface MessageRefWindow {
  refs: MessageRef[];
  capped: boolean;
}

export function windowedQuery(query: string, since: Date): string {
  return `${query} after:${gmailAfterDate(since)}`;
}

export function leavesWindowStart(now: Date = new Date()): Date {
  return monthStart(now, 1);
}

export function calendarWindowStart(now: Date = new Date()): Date {
  return monthStart(now, CALENDAR_MONTHS_BACK);
}

export async function collectMessageRefs(
  cap: number,
  fetchPage: (pageToken?: string) => Promise<MessageRefPage>,
): Promise<MessageRefWindow> {
  const refs: MessageRef[] = [];
  const seen = new Set<string>();
  let pageToken: string | undefined;
  let capped = false;

  do {
    const page = await fetchPage(pageToken);
    for (const ref of page.refs) {
      if (!ref.id || seen.has(ref.id)) continue;
      if (refs.length >= cap) {
        capped = true;
        break;
      }
      seen.add(ref.id);
      refs.push(ref);
    }
    pageToken = page.nextPageToken || undefined;
    if (pageToken && refs.length >= cap) capped = true;
  } while (pageToken && refs.length < cap);

  return { refs, capped };
}
