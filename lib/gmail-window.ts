import { gmailAfterDate, monthStart } from "./history";

export const LEAVES_MAX_MESSAGES = 500;
export const HISTORY_MAX_MESSAGES = 1000;
export const GMAIL_PAGE_SIZE = 100;

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
