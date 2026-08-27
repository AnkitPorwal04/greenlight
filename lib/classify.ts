import { isValidYmd } from "./leave-dates";

export type DirectKind = "leave" | "wfh" | "cancellation";

export interface DirectClassification {
  isRequest: boolean;
  kind: DirectKind;
  fromDate: string | null;
  toDate: string | null;
  leaveType: string | null;
  confidence: number;
  unclassifiable?: boolean;
}

export interface ClassifyInput {
  subject: string;
  from: string;
  bodyText: string;
  receivedAt?: string;
}

export interface ClassifyMeta {
  status?: number;
  rateLimited?: boolean;
}

export type Classifier = (
  input: ClassifyInput,
  meta?: ClassifyMeta
) => Promise<DirectClassification | null>;

export const RATE_LIMITED_STATUS = 429;

export const DEFAULT_GEMINI_MODEL = "gemini-3.1-flash-lite";
export const DEFAULT_MODEL_CHAIN = [
  DEFAULT_GEMINI_MODEL,
  "gemini-3.5-flash-lite",
  "gemini-flash-lite-latest",
];
export const CLASSIFY_TIMEOUT_MS = 8000;
export const MODEL_COOLDOWN_MS = 120000;
export const MAX_BODY_CHARS = 4000;

const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    isRequest: { type: "BOOLEAN" },
    kind: { type: "STRING", enum: ["leave", "wfh", "cancellation"] },
    fromDate: { type: "STRING", nullable: true },
    toDate: { type: "STRING", nullable: true },
    leaveType: { type: "STRING", nullable: true },
    confidence: { type: "NUMBER" },
  },
  required: ["isRequest", "kind", "fromDate", "toDate", "leaveType", "confidence"],
  propertyOrdering: [
    "isRequest",
    "kind",
    "fromDate",
    "toDate",
    "leaveType",
    "confidence",
  ],
} as const;

const SYSTEM_INSTRUCTION = [
  "You classify a single work email sent by an employee to their manager.",
  "Decide whether the employee is ASKING FOR time off, and reply with JSON only.",
  "",
  "The mail may be informal, very short, or written in Hinglish (a mix of Hindi and English).",
  'Treat "chutti", "chhutti", "leave chahiye", "off chahiye", "kal nahi aa paunga" and',
  "similar phrasings as a request for leave.",
  "",
  "kind:",
  '  "leave" — time off of any sort: vacation, sick, casual, earned, emergency, half day,',
  "    personal work, bereavement, a restricted holiday.",
  '  "wfh" — the employee will work, but from home or remotely rather than the office.',
  '  "cancellation" — the employee asks to cancel or withdraw leave they had already',
  "    requested or that was already approved.",
  "",
  "isRequest is false for anything that is not the employee asking for time off:",
  "status questions, policy questions, balance queries, FYI notes, handover notes,",
  "thanks or acknowledgements, mails about somebody else's leave, meeting invites,",
  "or a manager's own reply.",
  "",
  "fromDate and toDate are the first and last calendar day of the absence in",
  'YYYY-MM-DD form. Use the mail\'s received date to resolve relative wording such as',
  '"tomorrow", "kal", "next Monday" or "rest of the week". For a single day, set both',
  "to the same value. Use null when the mail does not make the dates clear — never guess.",
  "",
  "leaveType is the employee's own words for the type when they state one",
  '("sick leave", "casual leave", "half day", "earned leave"), otherwise null.',
  "",
  "confidence is 0 to 1: how sure you are that this mail really is a request for time",
  "off with the dates you extracted. Be honest — use a low value when the mail is vague,",
  "when the dates are unclear, or when it might be discussing rather than requesting.",
  "Reserve 0.9 and above for mails that state both the intent and the dates beyond doubt.",
  "",
  "Output ONLY the JSON object. No prose, no markdown, no code fences.",
].join("\n");

export const UNCLASSIFIABLE: DirectClassification = {
  isRequest: false,
  kind: "leave",
  fromDate: null,
  toDate: null,
  leaveType: null,
  confidence: 0,
  unclassifiable: true,
};

export function isUnclassifiable(
  classification: DirectClassification | null | undefined
): boolean {
  return classification?.unclassifiable === true;
}

export function parseModelChain(raw: string | undefined): string[] {
  const chain: string[] = [];
  for (const part of String(raw ?? "").split(",")) {
    const model = part.trim();
    if (!model || chain.includes(model)) continue;
    chain.push(model);
  }
  return chain.length > 0 ? chain : [...DEFAULT_MODEL_CHAIN];
}

const coolingDown = new Map<string, number>();

export function resetModelCooldowns(): void {
  coolingDown.clear();
}

function isCoolingDown(model: string): boolean {
  const until = coolingDown.get(model);
  if (until === undefined) return false;
  if (until > Date.now()) return true;
  coolingDown.delete(model);
  return false;
}

function markModelDown(model: string): void {
  coolingDown.set(model, Date.now() + MODEL_COOLDOWN_MS);
}

let warned = false;

function warnOnce(message: string): void {
  if (warned) return;
  warned = true;
  console.warn(`Gemini classification unavailable: ${message}`);
}

function normalizeKind(value: unknown): DirectKind {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (raw === "wfh" || raw.includes("work from home") || raw.includes("work_from_home")) {
    return "wfh";
  }
  if (raw.startsWith("cancel")) return "cancellation";
  return "leave";
}

function normalizeYmd(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return isValidYmd(trimmed) ? trimmed : null;
}

function normalizeLeaveType(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/\s+/g, " ").slice(0, 60);
  return trimmed ? trimmed : null;
}

function normalizeConfidence(value: unknown): number {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.min(1, Math.max(0, num));
}

function stripFences(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return (fenced ? fenced[1] : trimmed).trim();
}

export function parseClassification(text: string): DirectClassification | null {
  if (typeof text !== "string") return null;
  const source = stripFences(text);
  if (!source) return null;

  let raw: unknown;
  try {
    raw = JSON.parse(source);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

  const record = raw as Record<string, unknown>;
  if (typeof record.isRequest !== "boolean") return null;

  const fromDate = normalizeYmd(record.fromDate);
  const toDate = normalizeYmd(record.toDate);

  return {
    isRequest: record.isRequest,
    kind: normalizeKind(record.kind),
    fromDate,
    toDate: toDate ?? fromDate,
    leaveType: normalizeLeaveType(record.leaveType),
    confidence: normalizeConfidence(record.confidence),
  };
}

export function buildClassifyPrompt(input: ClassifyInput): string {
  const body = String(input.bodyText ?? "")
    .replace(/\r/g, "")
    .slice(0, MAX_BODY_CHARS);
  const received = input.receivedAt ? new Date(input.receivedAt) : null;
  const headers = [
    `From: ${String(input.from ?? "").slice(0, 200)}`,
    `Subject: ${String(input.subject ?? "").slice(0, 300)}`,
  ];
  if (received && !Number.isNaN(received.getTime())) {
    headers.push(`Received: ${received.toISOString().slice(0, 10)}`);
  }

  return [...headers, "", "Body:", body].join("\n");
}

function extractText(payload: unknown): string {
  const data = payload as {
    candidates?: {
      content?: { parts?: { text?: string; thought?: boolean }[] };
    }[];
  };
  const parts = data?.candidates?.[0]?.content?.parts ?? [];
  return parts
    .filter((part) => part?.thought !== true && typeof part?.text === "string")
    .map((part) => part.text as string)
    .join("");
}

type Attempt =
  | { outcome: "answer"; status: number; classification: DirectClassification }
  | { outcome: "stop"; status: number }
  | { outcome: "rotate"; status?: number; rateLimited: boolean };

function rotatesOn(status: number): boolean {
  return status === 404 || status === RATE_LIMITED_STATUS || status >= 500;
}

async function attemptModel(
  model: string,
  input: ClassifyInput,
  apiKey: string
): Promise<Attempt> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CLASSIFY_TIMEOUT_MS);

  try {
    const res = await fetch(
      `${GEMINI_ENDPOINT}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [
            { role: "user", parts: [{ text: buildClassifyPrompt(input) }] },
          ],
          systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
          generationConfig: {
            temperature: 0,
            responseMimeType: "application/json",
            responseSchema: RESPONSE_SCHEMA,
          },
        }),
      }
    );

    if (!res.ok) {
      warnOnce(`HTTP ${res.status} from ${model}`);
      if (rotatesOn(res.status)) {
        return {
          outcome: "rotate",
          status: res.status,
          rateLimited: res.status === RATE_LIMITED_STATUS,
        };
      }
      return { outcome: "stop", status: res.status };
    }

    const parsed = parseClassification(extractText(await res.json()));
    if (parsed) {
      return { outcome: "answer", status: res.status, classification: parsed };
    }
    warnOnce(`no usable answer from ${model}`);
    return {
      outcome: "answer",
      status: res.status,
      classification: UNCLASSIFIABLE,
    };
  } catch (e) {
    warnOnce(e instanceof Error ? e.message : "request failed");
    return { outcome: "rotate", rateLimited: false };
  } finally {
    clearTimeout(timer);
  }
}

export async function classifyMail(
  input: ClassifyInput,
  meta?: ClassifyMeta
): Promise<DirectClassification | null> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return null;

  let attempts = 0;
  let rateLimited = 0;
  let lastStatus: number | undefined;

  for (const model of parseModelChain(process.env.GEMINI_MODEL)) {
    if (isCoolingDown(model)) continue;

    attempts += 1;
    const attempt = await attemptModel(model, input, apiKey);
    if (attempt.status !== undefined) lastStatus = attempt.status;

    if (attempt.outcome === "answer") {
      if (meta) {
        meta.status = attempt.status;
        meta.rateLimited = false;
      }
      return attempt.classification;
    }

    if (attempt.outcome === "stop") {
      if (meta) {
        meta.status = attempt.status;
        meta.rateLimited = false;
      }
      return null;
    }

    if (attempt.rateLimited) rateLimited += 1;
    markModelDown(model);
  }

  if (attempts > 0 && meta) {
    if (lastStatus !== undefined) meta.status = lastStatus;
    meta.rateLimited = rateLimited === attempts;
  }
  return null;
}
