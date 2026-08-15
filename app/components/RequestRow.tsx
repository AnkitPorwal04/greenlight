import { useState } from "react";
import type { LeaveRequest } from "@/lib/types";
import {
  IconAlert,
  IconCalendar,
  IconCheck,
  IconCheckCircle,
  IconChevron,
  IconHistory,
  IconMail,
  IconUndo,
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
  const content: Record<string, { icon: React.ReactNode; label: string }> = {
    approved: { icon: <IconCheck className="h-3 w-3" />, label: "Approved" },
    rejected: { icon: <IconX className="h-3 w-3" />, label: "Rejected" },
    handled: { icon: <IconHistory className="h-3 w-3" />, label: "Handled" },
  };
  const c = content[request.status] ?? content.handled;
  return (
    <span
      title={request.decisionNote}
      className={`inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold ${
        map[request.status] ?? map.handled
      }`}
    >
      {c.icon}
      {c.label}
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
  onUndo,
  onViewEmail,
}: {
  request: LeaveRequest;
  onDecide: (action: Action) => void;
  onMark: () => void;
  onUndo: () => void;
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
            <h3 className="min-w-0 max-w-full truncate text-[15px] font-semibold text-[var(--text-primary)]">
              {r.employeeName}
            </h3>
            <span
              className={`min-w-0 max-w-full truncate rounded-md border px-1.5 py-0.5 text-[11px] font-medium ${leaveTypeStyle(
                r.leaveType
              )}`}
            >
              {r.leaveType || "Leave"}
            </span>
            {isPending && !r.emailVerified && (
              <span
                title="Email address was guessed from the name"
                className="inline-flex shrink-0 items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[11px] font-medium text-[var(--c-amber)]"
              >
                <IconAlert className="h-3 w-3" />
                Unverified
              </span>
            )}
          </div>

          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            <span className="font-mono text-[var(--text-muted)]">
              {r.employeeCode}
            </span>
            <Meta>·</Meta>
            <span className="inline-flex min-w-0 max-w-full items-center gap-1.5 text-[var(--text-secondary)]">
              <IconCalendar className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
              <span className="truncate">{dateRange(r)}</span>
            </span>
            <Meta>·</Meta>
            <Meta>{dayCount(r.numberOfDays)}</Meta>
            <Meta>·</Meta>
            <Meta>{clockTime(r.receivedAt)}</Meta>
          </div>

          <button
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="group mt-1 flex w-full items-start gap-1.5 py-2.5 text-left md:mt-2 md:py-1"
          >
            <span
              className={`min-w-0 break-words text-[13px] leading-relaxed text-[var(--text-secondary)] transition group-hover:text-[var(--text-primary)] ${
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
            <dl className="rise-in mt-3 grid gap-x-6 gap-y-2 rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] p-3 text-xs sm:grid-cols-2">
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
              <div className="min-w-0 sm:col-span-2">
                <dt className="text-[var(--text-muted)]">Reply address</dt>
                <dd className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[var(--text-primary)]">
                  <IconMail className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
                  <span className="min-w-0 truncate">
                    {r.employeeEmail || "—"}
                  </span>
                  <span
                    className={`inline-flex shrink-0 items-center gap-1 ${
                      r.emailVerified
                        ? "text-[var(--c-emerald)]"
                        : "text-[var(--c-amber)]"
                    }`}
                  >
                    {r.emailVerified ? (
                      <IconCheckCircle className="h-3.5 w-3.5" />
                    ) : (
                      <IconAlert className="h-3.5 w-3.5" />
                    )}
                    {r.emailVerified ? "Verified" : "Guessed"}
                  </span>
                </dd>
              </div>
              {r.ccRecipients.length > 0 && (
                <div className="min-w-0 sm:col-span-2">
                  <dt className="text-[var(--text-muted)]">CC on reply</dt>
                  <dd className="mt-0.5 break-words text-[var(--text-primary)]">
                    {r.ccRecipients.join(", ")}
                  </dd>
                </div>
              )}
              {r.decisionNote && (
                <div className="min-w-0 sm:col-span-2">
                  <dt className="text-[var(--text-muted)]">Decision note</dt>
                  <dd className="mt-0.5 break-words text-[var(--text-primary)]">
                    {r.decisionNote}
                  </dd>
                </div>
              )}
              <div className="min-w-0 sm:col-span-2">
                <button
                  onClick={onViewEmail}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-2 text-[11px] font-medium text-[var(--text-secondary)] transition hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] md:min-h-0 md:px-2.5 md:py-1.5"
                >
                  <IconMail className="h-3.5 w-3.5" />
                  View email
                </button>
              </div>
            </dl>
          )}
        </div>

        {isPending ? (
          <div className="hidden shrink-0 items-center gap-1.5 sm:flex">
            <button
              onClick={() => onDecide("approved")}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-500"
            >
              <IconCheck className="h-3.5 w-3.5" />
              Approve
            </button>
            <button
              onClick={() => onDecide("rejected")}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs font-semibold text-[var(--text-secondary)] transition hover:border-rose-500/50 hover:bg-rose-500/10 hover:text-[var(--c-rose)]"
            >
              <IconX className="h-3.5 w-3.5" />
              Reject
            </button>
            <button
              onClick={onMark}
              title="Record as done without sending any mail"
              className="inline-flex items-center rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-muted)] transition hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
            >
              Handled
            </button>
          </div>
        ) : (
          <div className="flex shrink-0 flex-col items-end gap-2">
            <div className="flex items-center gap-1.5">
              {r.status === "handled" && (
                <button
                  onClick={onUndo}
                  title="Move this request back to Pending"
                  className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-1.5 py-1 text-[11px] font-medium text-[var(--text-muted)] transition hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
                >
                  <IconUndo className="h-3 w-3" />
                  Undo
                </button>
              )}
              <StatusPill request={r} />
            </div>
            {r.decidedAt && (
              <span className="text-[11px] text-[var(--text-muted)]">
                {timeAgo(r.decidedAt)}
              </span>
            )}
          </div>
        )}
      </div>

      {isPending && (
        <div className="mt-3 flex items-center gap-2 sm:hidden">
          <button
            onClick={() => onDecide("approved")}
            className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 text-xs font-semibold text-white transition hover:bg-emerald-500"
          >
            <IconCheck className="h-3.5 w-3.5" />
            Approve
          </button>
          <button
            onClick={() => onDecide("rejected")}
            className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg border border-[var(--border)] text-xs font-semibold text-[var(--text-secondary)] transition hover:border-rose-500/50 hover:bg-rose-500/10 hover:text-[var(--c-rose)]"
          >
            <IconX className="h-3.5 w-3.5" />
            Reject
          </button>
          <button
            onClick={onMark}
            className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] px-3 text-xs font-medium text-[var(--text-muted)] transition hover:text-[var(--text-primary)]"
          >
            Handled
          </button>
        </div>
      )}
    </article>
  );
}
