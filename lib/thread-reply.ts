export interface ThreadHeader {
  name?: string | null;
  value?: string | null;
}

export interface ThreadMessage {
  id?: string | null;
  internalDate?: string | null;
  payload?: { headers?: ThreadHeader[] | null } | null;
}

export interface ReplyScope {
  messages: ThreadMessage[];
  applicationMsgId: string;
  selfEmail: string;
  applicationsInThread: number;
}

export function headerValue(
  msg: ThreadMessage | undefined,
  name: string,
): string {
  const wanted = name.toLowerCase();
  return (
    msg?.payload?.headers?.find((h) => h?.name?.toLowerCase() === wanted)
      ?.value ?? ""
  );
}

export function messageIdTokens(value: string): string[] {
  const raw = value?.trim() ?? "";
  if (!raw) return [];
  const bracketed = raw.match(/<[^<>]+>/g);
  const parts = bracketed ?? raw.split(/[\s,]+/);
  return parts
    .map((part) => part.trim().replace(/^</, "").replace(/>$/, "").trim())
    .filter(Boolean)
    .map((part) => part.toLowerCase());
}

function timeOf(msg: ThreadMessage | undefined): number {
  const raw = msg?.internalDate;
  if (!raw) return 0;
  const ms = parseInt(raw, 10);
  return Number.isFinite(ms) ? ms : 0;
}

function fromAddress(msg: ThreadMessage): string {
  return headerValue(msg, "from").toLowerCase();
}

export function replyCoversApplication(scope: ReplyScope): boolean {
  const self = scope.selfEmail.trim().toLowerCase();
  if (!self) return false;

  const messages = scope.messages ?? [];
  const application = messages.find((m) => m.id === scope.applicationMsgId);
  const applicationTime = timeOf(application);
  const [applicationId] = messageIdTokens(
    headerValue(application, "message-id"),
  );

  let untargetedReply = false;

  for (const msg of messages) {
    if (msg.id === scope.applicationMsgId) continue;
    if (!fromAddress(msg).includes(self)) continue;

    const targets = messageIdTokens(headerValue(msg, "in-reply-to"));
    if (targets.length > 0) {
      if (applicationId && targets.includes(applicationId)) return true;
      continue;
    }
    if (timeOf(msg) > applicationTime) untargetedReply = true;
  }

  return untargetedReply && scope.applicationsInThread <= 1;
}
