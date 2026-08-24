import type { LeaveRequest } from "@/lib/types";

export type AuthState = {
  connected: boolean;
  email?: string;
  hasTeam?: boolean;
  teamCount?: number;
};
export type Action = "approved" | "rejected";
export type View = "dashboard" | "history" | "stats" | "calendar";
export type ToastTone = "success" | "error";

export interface ToastState {
  message: string;
  tone?: ToastTone;
}

export interface ModalState {
  request: LeaveRequest;
  action: Action;
  to: string;
  cc: string[];
  body: string;
  note: string;
  sending: boolean;
  error?: string;
  // Manager ticked "this recipient is correct" for an address that is not
  // verified from the directory. Required before an unverified mail can send.
  confirmed: boolean;
}

export const EMAIL_RE = /^[\w.+-]+@[\w-]+(\.[\w-]+)+$/;

export function isEmail(value: string) {
  return EMAIL_RE.test(value.trim());
}

export interface DateGroup {
  key: string;
  label: string;
  sub: string;
  items: LeaveRequest[];
}

const LEAVE_TYPE_STYLES: Record<string, string> = {
  "work from home": "text-[var(--c-sky)]",
  "casual leave": "text-[var(--c-violet)]",
  "sick leave": "text-[var(--c-pink)]",
  "earned leave": "text-[var(--c-amber)]",
  "restricted holiday": "text-[var(--c-teal)]",
};

const AVATAR_TONES = [
  "bg-[var(--surface-raised)] text-[var(--text-secondary)]",
  "bg-[var(--accent-soft)] text-[var(--accent)]",
  "bg-[var(--surface-raised)] text-[var(--c-sky)]",
  "bg-[var(--surface-raised)] text-[var(--c-teal)]",
  "bg-[var(--surface-raised)] text-[var(--c-violet)]",
  "bg-[var(--surface-raised)] text-[var(--c-amber)]",
];

export function leaveTypeStyle(type: string) {
  return (
    LEAVE_TYPE_STYLES[type.trim().toLowerCase()] ?? "text-[var(--text-muted)]"
  );
}

const LEAVE_TYPE_COLORS: Record<string, string> = {
  "work from home": "var(--c-sky)",
  "casual leave": "var(--c-violet)",
  "sick leave": "var(--c-pink)",
  "earned leave": "var(--c-amber)",
  "restricted holiday": "var(--c-teal)",
};

const FALLBACK_COLORS = [
  "var(--c-emerald)",
  "var(--c-sky)",
  "var(--c-violet)",
  "var(--c-amber)",
  "var(--c-teal)",
  "var(--c-pink)",
];

export function leaveTypeColor(type: string, index = 0) {
  return (
    LEAVE_TYPE_COLORS[type.trim().toLowerCase()] ??
    FALLBACK_COLORS[index % FALLBACK_COLORS.length]
  );
}

export function leaveTypeShort(type: string) {
  const words = type.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "—";
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return words
    .map((w) => w[0].toUpperCase())
    .join("")
    .slice(0, 4);
}

export function statusLabel(status: string) {
  if (status === "approved") return "Approved";
  if (status === "rejected") return "Rejected";
  if (status === "withdrawn") return "Withdrawn";
  if (status === "handled") return "Handled";
  return "Pending";
}

export function statusTone(status: string) {
  if (status === "approved") return "text-[var(--c-emerald)]";
  if (status === "rejected") return "text-[var(--c-rose)]";
  if (status === "pending") return "text-[var(--c-amber)]";
  return "text-[var(--text-muted)]";
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

export function daySubLabel(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d
    .toLocaleDateString("en-GB", {
      weekday: "short",
      day: "2-digit",
      month: "short",
    })
    .replace(/,/g, "");
}

export function dayHeading(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Undated";
  const diff = Math.round((startOfDay(new Date()) - startOfDay(d)) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return daySubLabel(iso);
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
      const label = dayHeading(request.receivedAt);
      const sub = daySubLabel(request.receivedAt);
      group = {
        key,
        label,
        sub: sub === label ? "" : sub,
        items: [],
      };
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

// Shorter range for tight spaces (mobile). When both dates share the same
// month and year, collapse "17 Aug 2026 – 18 Aug 2026" to "17 – 18 Aug 2026".
// Falls back to the full range if the dates do not parse as "DD Mon YYYY".
export function dateRangeCompact(request: LeaveRequest) {
  const { fromDate, toDate } = request;
  if (!fromDate || !toDate || fromDate === toDate) {
    return fromDate || toDate || "";
  }
  const from = fromDate.trim().split(/\s+/);
  const to = toDate.trim().split(/\s+/);
  if (
    from.length === 3 &&
    to.length === 3 &&
    from[1] === to[1] &&
    from[2] === to[2]
  ) {
    return `${from[0]} – ${toDate}`;
  }
  return `${fromDate} – ${toDate}`;
}

export function dayCount(n: number) {
  return `${n} ${n === 1 ? "day" : "days"}`;
}
