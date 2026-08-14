import { useState } from "react";
import type { LeaveRequest } from "@/lib/types";
import {
  IconAlert,
  IconCalendar,
  IconCheck,
  IconChevron,
  IconMail,
  IconX,
} from "./icons";
import {
  avatarTone,
  clockTime,
  dateRange,
  dayCount,
  initials,
  leaveTypeStyle,
  timeAgo,
  type Action,
} from "./utils";

function StatusPill({ request }: { request: LeaveRequest }) {
  const map: Record<string, string> = {
    approved:
      "border-emerald-500/30 bg-emerald-500/10 text-[var(--c-emerald)]",
    rejected: "border-rose-500/30 bg-rose-500/10 text-[var(--c-rose)]",
    handled:
      "border-[var(--border)] bg-[var(--surface-raised)] text-[var(--text-secondary)]",
  };
  const label: Record<string, string> = {
    approved: "✓ Approved",
    rejected: "✕ Rejected",
    handled: "✔ Handled",
  };
  return (
    <span
      title={request.decisionNote}
      className={`inline-flex shrink-0 items-center rounded-md border px-2 py-1 text-[11px] font-semibold ${
        map[request.status] ?? map.handled
      }`}
    >
      {label[request.status] ?? label.handled}
    </span>
  );
}

function Meta({ children }: { children: React.ReactNode }) {
  return <span className="text-[var(--text-muted)]">{children}</span>;
}

export function RequestRow({
  request: r,
  onDecide,
  onMark,
  onViewEmail,
}: {
  request: LeaveRequest;
  onDecide: (action: Action) => void;
  onMark: () => void;
  onViewEmail: () => void;
}) {
  const [open, setOpen] = useState(false);
  const isPending = r.status === "pending";
  const reason = r.reason?.trim() || "No reason provided.";

  return (
    <article className="panel-hover px-4 py-3.5 transition-colors sm:px-5">
      <div className="flex items-start gap-3 sm:gap-4">
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-semibold ${avatarTone(
            r.employeeName
          )}`}
        >
          {initials(r.employeeName)}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="truncate text-sm font-semibold text-[var(--text-primary)]">
              {r.employeeName}
            </h3>
            <span className="font-mono text-[11px] text-[var(--text-muted)]">
              {r.employeeCode}
            </span>
            <span
              className={`rounded-md border px-1.5 py-0.5 text-[11px] font-medium ${leaveTypeStyle(
                r.leaveType
              )}`}
            >
              {r.leaveType || "Leave"}
            </span>
            {isPending && !r.emailVerified && (
              <span
                title="Email address was guessed from the name"
                className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[11px] font-medium text-[var(--c-amber)]"
              >
                <IconAlert className="h-3 w-3" />
                Unverified
              </span>
            )}
          </div>

          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            <span className="inline-flex items-center gap-1.5 text-[var(--text-secondary)]">
              <IconCalendar className="h-3.5 w-3.5 text-[var(--text-muted)]" />
              {dateRange(r)}
            </span>
            <Meta>·</Meta>
            <Meta>{dayCount(r.numberOfDays)}</Meta>
            <Meta>·</Meta>
            <Meta>{clockTime(r.receivedAt)}</Meta>
          </div>

          <button
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="group mt-2 flex w-full items-start gap-1.5 text-left"
          >
            <span
              className={`text-xs leading-relaxed text-[var(--text-secondary)] transition group-hover:text-[var(--text-primary)] ${
                open ? "" : "line-clamp-1"
              }`}
            >
              {reason}
            </span>
            <IconChevron
              className={`mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--text-muted)] transition-transform group-hover:text-[var(--text-secondary)] ${
                open ? "rotate-180" : ""
              }`}
            />
          </button>

          {open && (
            <dl className="rise-in mt-3 grid gap-x-6 gap-y-2 rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] p-3 text-[11px] sm:grid-cols-2">
              <div>
                <dt className="text-[var(--text-muted)]">Leave balance</dt>
                <dd className="mt-0.5 text-[var(--text-primary)]">
                  {r.leaveBalance || "—"}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--text-muted)]">Session</dt>
                <dd className="mt-0.5 text-[var(--text-primary)]">
                  {r.fromSession} → {r.toSession}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-[var(--text-muted)]">Reply address</dt>
                <dd className="mt-0.5 flex items-center gap-1.5 text-[var(--text-primary)]">
                  <IconMail className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                  <span className="truncate">{r.employeeEmail || "—"}</span>
                  <span
                    className={
                      r.emailVerified
                        ? "text-[var(--c-emerald)]"
                        : "text-[var(--c-amber)]"
                    }
                  >
                    {r.emailVerified ? "✓ Verified" : "⚠ Guessed"}
                  </span>
                </dd>
              </div>
              {r.ccRecipients.length > 0 && (
                <div className="sm:col-span-2">
                  <dt className="text-[var(--text-muted)]">CC on reply</dt>
                  <dd className="mt-0.5 break-words text-[var(--text-primary)]">
                    {r.ccRecipients.join(", ")}
                  </dd>
                </div>
              )}
              {r.decisionNote && (
                <div className="sm:col-span-2">
                  <dt className="text-[var(--text-muted)]">Decision note</dt>
                  <dd className="mt-0.5 text-[var(--text-primary)]">
                    {r.decisionNote}
                  </dd>
                </div>
              )}
              <div className="sm:col-span-2">
                <button
                  onClick={onViewEmail}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--text-secondary)] transition hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
                >
                  <IconMail className="h-3.5 w-3.5" />
                  View email
                </button>
              </div>
            </dl>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          {isPending ? (
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => onDecide("approved")}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-500"
              >
                <IconCheck className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Approve</span>
              </button>
              <button
                onClick={() => onDecide("rejected")}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs font-semibold text-[var(--text-secondary)] transition hover:border-rose-500/50 hover:bg-rose-500/10 hover:text-[var(--c-rose)]"
              >
                <IconX className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Reject</span>
              </button>
              <button
                onClick={onMark}
                title="Record as done without sending any mail"
                className="hidden rounded-lg px-2.5 py-1.5 text-xs font-medium text-[var(--text-muted)] transition hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)] md:inline-flex"
              >
                Handled
              </button>
            </div>
          ) : (
            <>
              <StatusPill request={r} />
              {r.decidedAt && (
                <span className="text-[11px] text-[var(--text-muted)]">
                  {timeAgo(r.decidedAt)}
                </span>
              )}
            </>
          )}
        </div>
      </div>

      {isPending && (
        <div className="mt-2 flex justify-end md:hidden">
          <button
            onClick={onMark}
            className="rounded-lg px-2.5 py-1 text-xs font-medium text-[var(--text-muted)] transition hover:text-[var(--text-primary)]"
          >
            Mark handled
          </button>
        </div>
      )}
    </article>
  );
}
