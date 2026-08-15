import type { LeaveRequest } from "@/lib/types";

export type AuthState = { connected: boolean; email?: string };
export type Action = "approved" | "rejected";
export type View = "dashboard" | "history";

export interface ModalState {
  request: LeaveRequest;
  action: Action;
  to: string;
  cc: string[];
  body: string;
  note: string;
  sending: boolean;
  error?: string;
}

export const EMAIL_RE = /^[\w.+-]+@[\w-]+(\.[\w-]+)+$/;

export function isEmail(value: string) {
  return EMAIL_RE.test(value.trim());
}

export interface DateGroup {
  key: string;
  label: string;
  items: LeaveRequest[];
}

const LEAVE_TYPE_STYLES: Record<string, string> = {
  "work from home": "border-sky-500/30 bg-sky-500/10 text-[var(--c-sky)]",
  "casual leave":
    "border-violet-500/30 bg-violet-500/10 text-[var(--c-violet)]",
  "sick leave": "border-rose-500/30 bg-rose-500/10 text-[var(--c-rose)]",
  "earned leave": "border-amber-500/30 bg-amber-500/10 text-[var(--c-amber)]",
  "restricted holiday":
    "border-teal-500/30 bg-teal-500/10 text-[var(--c-teal)]",
};

const AVATAR_TONES = [
  "bg-indigo-500/15 text-[var(--c-indigo)]",
  "bg-emerald-500/15 text-[var(--c-emerald)]",
  "bg-sky-500/15 text-[var(--c-sky)]",
  "bg-amber-500/15 text-[var(--c-amber)]",
  "bg-fuchsia-500/15 text-[var(--c-fuchsia)]",
  "bg-teal-500/15 text-[var(--c-teal)]",
];

export function leaveTypeStyle(type: string) {
  return (
    LEAVE_TYPE_STYLES[type.trim().toLowerCase()] ??
    "border-[var(--border)] bg-[var(--surface-raised)] text-[var(--text-secondary)]"
  );
}

export function avatarTone(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return AVATAR_TONES[hash % AVATAR_TONES.length];
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  if (parts.length === 0) return "?";
  return parts.map((w) => w[0]?.toUpperCase() ?? "").join("");
}

export function timeAgo(iso: string) {
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return "";
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(ts).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
  });
}

export function clockTime(iso: string) {
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return "";
  return new Date(ts).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function dayKey(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "unknown";
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

export function dayLabel(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Undated";
  const diff = Math.round((startOfDay(new Date()) - startOfDay(d)) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function groupByDate(list: LeaveRequest[]): DateGroup[] {
  const sorted = [...list].sort(
    (a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime()
  );
  const groups: DateGroup[] = [];
  const seen = new Map<string, DateGroup>();
  for (const request of sorted) {
    const key = dayKey(request.receivedAt);
    let group = seen.get(key);
    if (!group) {
      group = { key, label: dayLabel(request.receivedAt), items: [] };
      seen.set(key, group);
      groups.push(group);
    }
    group.items.push(request);
  }
  return groups;
}

export function matchesQuery(request: LeaveRequest, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    request.employeeName.toLowerCase().includes(q) ||
    request.employeeCode.toLowerCase().includes(q)
  );
}

export function dateRange(request: LeaveRequest) {
  return request.fromDate === request.toDate
    ? request.fromDate
    : `${request.fromDate} – ${request.toDate}`;
}

export function dayCount(n: number) {
  return `${n} ${n === 1 ? "day" : "days"}`;
}
