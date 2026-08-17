import { useState } from "react";
import type { LeaveRequest } from "@/lib/types";
import {
  IconAlert,
  IconCheck,
  IconCheckCircle,
  IconChevron,
  IconMail,
  IconUndo,
  IconX,
  StatusLamp,
} from "./icons";
import {
  avatarTone,
  clockTime,
  dateRange,
  dateRangeCompact,
  dayCount,
  initials,
  leaveTypeStyle,
  statusLabel,
  statusTone,
  timeAgo,
  type Action,
} from "./utils";

function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="kbd ml-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
      {children}
    </kbd>
  );
}

function Meta({ children }: { children: React.ReactNode }) {
  return <span className="text-[var(--text-muted)]">{children}</span>;
}

function MetaSegment({
  children,
  className = "inline-flex",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={`${className} whitespace-nowrap items-center gap-x-2`}>
      <span aria-hidden="true" className="text-[var(--text-muted)]">
        ·
      </span>
      {children}
    </span>
  );
}

export function RequestRow({
  request: r,
  exiting,
  pulse,
  selected,
  busy,
  onDecide,
  onMark,
  onUndo,
  onViewEmail,
  onSelect,
}: {
  request: LeaveRequest;
  exiting?: boolean;
  pulse?: Action;
  selected?: boolean;
  busy?: boolean;
  onDecide: (action: Action) => void;
  onMark: () => void;
  onUndo: () => void;
  onViewEmail: () => void;
  onSelect?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const isPending = r.status === "pending";
  const reason = r.reason?.trim() || "No reason provided.";
  const type = r.leaveType || "Leave";

  return (
    <article
      id={`gl-row-${r.id}`}
      tabIndex={0}
      aria-busy={busy || undefined}
      onFocusCapture={onSelect}
      className={`panel-hover group px-1 py-4 outline-none transition-colors sm:px-2 ${
        selected
          ? "sm:bg-[var(--accent-soft)] sm:ring-2 sm:ring-inset sm:ring-[var(--accent-ring)]"
          : ""
      } ${exiting ? "row-exit" : ""}`}
    >
      <div className="flex items-start gap-3 sm:gap-4">
        <StatusLamp
          status={r.status}
          pulse={pulse}
          className="mt-0.5 shrink-0"
        />
        <span className="sr-only">{statusLabel(r.status)}</span>

        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold tracking-wide ${avatarTone(
            r.employeeName
          )}`}
        >
          {initials(r.employeeName)}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <h3 className="min-w-0 max-w-full truncate text-[15px] font-semibold tracking-tight text-[var(--text-primary)]">
              {r.employeeName}
            </h3>
            <span className="min-w-0 max-w-full truncate font-mono text-[11px] uppercase tracking-wide text-[var(--text-muted)]">
              {r.employeeCode}
            </span>
            {isPending && !r.emailVerified && (
              <span
                title="Email address was guessed from the name"
                className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-[var(--c-amber)]"
              >
                <IconAlert className="h-3 w-3" />
                Unverified
              </span>
            )}
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] lg:hidden">
            <span
              className={`whitespace-nowrap font-medium ${leaveTypeStyle(type)}`}
            >
              {type}
            </span>
            <MetaSegment>
              <span className="whitespace-nowrap font-mono text-[var(--text-secondary)]">
                {dateRangeCompact(r)}
              </span>
            </MetaSegment>
            <MetaSegment>
              <Meta>
                <span className="font-mono">{dayCount(r.numberOfDays)}</span>
              </Meta>
            </MetaSegment>
            {/* Mail arrival time is shown only from lg up; on phones it just
                overflowed the meta line onto a stray second row. */}
            {clockTime(r.receivedAt) && (
              <MetaSegment className="hidden sm:inline-flex">
                <Meta>
                  <span className="font-mono">{clockTime(r.receivedAt)}</span>
                </Meta>
              </MetaSegment>
            )}
          </div>

          <button
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="mt-1.5 flex min-h-10 w-full items-start gap-1.5 py-1.5 text-left md:min-h-0 md:py-0.5"
          >
            <span
              className={`min-w-0 break-words text-[13px] leading-relaxed text-[var(--text-muted)] transition hover:text-[var(--text-secondary)] ${
                open ? "" : "line-clamp-1"
              }`}
            >
              {reason}
            </span>
            <IconChevron
              className={`mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--text-muted)] transition-transform ${
                open ? "rotate-180" : ""
              }`}
            />
          </button>

          {open && (
            <dl className="rise-in mt-3 grid gap-x-8 gap-y-3 border-l border-[var(--border)] py-1 pl-4 text-[12px] sm:grid-cols-2">
              <div>
                <dt className="text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)]">
                  Leave balance
                </dt>
                <dd className="mt-1 font-mono text-[var(--text-primary)]">
                  {r.leaveBalance || "—"}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)]">
                  Session
                </dt>
                <dd className="mt-1 text-[var(--text-primary)]">
                  {r.fromSession} → {r.toSession}
                </dd>
              </div>
              <div className="min-w-0 sm:col-span-2">
                <dt className="text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)]">
                  Reply address
                </dt>
                <dd className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[var(--text-primary)]">
                  <span className="min-w-0 truncate font-mono">
                    {r.employeeEmail || "—"}
                  </span>
                  <span
                    className={`inline-flex shrink-0 items-center gap-1 text-[11px] ${
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
                  <dt className="text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)]">
                    CC on reply
                  </dt>
                  <dd className="mt-1 break-all font-mono text-[var(--text-primary)]">
                    {r.ccRecipients.join(", ")}
                  </dd>
                </div>
              )}
              {r.decisionNote && (
                <div className="min-w-0 sm:col-span-2">
                  <dt className="text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)]">
                    Decision note
                  </dt>
                  <dd className="mt-1 break-words text-[var(--text-primary)]">
                    {r.decisionNote}
                  </dd>
                </div>
              )}
              <div className="min-w-0 sm:col-span-2">
                <button
                  onClick={onViewEmail}
                  className="press inline-flex min-h-10 items-center gap-1.5 text-[12px] font-medium text-[var(--text-secondary)] underline decoration-[var(--border-strong)] underline-offset-4 hover:text-[var(--text-primary)] md:min-h-9"
                >
                  <IconMail className="h-3.5 w-3.5" />
                  View original email
                </button>
              </div>
            </dl>
          )}
        </div>

        <div className="hidden w-[13.5rem] shrink-0 pt-0.5 lg:block">
          <p className="truncate font-mono text-[13px] text-[var(--text-secondary)]">
            {dateRange(r)}
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-[11px]">
            <span className={`font-medium ${leaveTypeStyle(type)}`}>
              {type}
            </span>
            <span className="text-[var(--text-muted)]">·</span>
            <span className="font-mono text-[var(--text-muted)]">
              {dayCount(r.numberOfDays)}
            </span>
            <span className="text-[var(--text-muted)]">·</span>
            <span className="font-mono text-[var(--text-muted)]">
              {clockTime(r.receivedAt)}
            </span>
          </p>
        </div>

        {isPending ? (
          <div className="hidden shrink-0 items-center gap-1 pt-0.5 sm:flex">
            <button
              onClick={() => onDecide("approved")}
              disabled={busy}
              className="accent press inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] font-semibold disabled:opacity-50"
            >
              <IconCheck className="h-3.5 w-3.5" />
              Approve
              <Key>A</Key>
            </button>
            <button
              onClick={() => onDecide("rejected")}
              disabled={busy}
              className="press inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-raised)] hover:text-[var(--c-rose)] disabled:opacity-50"
            >
              Reject
              <Key>R</Key>
            </button>
            <button
              onClick={onMark}
              disabled={busy}
              title="Record as done without sending any mail"
              className="press inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] font-medium text-[var(--text-muted)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)] disabled:opacity-50"
            >
              Handled
              <Key>H</Key>
            </button>
            <button
              onClick={onViewEmail}
              aria-label="View original email"
              title="View original email"
              className="press inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-[var(--text-muted)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)]"
            >
              <IconMail className="h-3.5 w-3.5" />
              <Key>E</Key>
            </button>
          </div>
        ) : (
          <div className="flex shrink-0 flex-col items-end gap-2 pt-0.5">
            <div className="flex items-center gap-2">
              <span
                title={r.decisionNote}
                className={`text-[11px] font-semibold uppercase tracking-[0.12em] ${statusTone(
                  r.status
                )}`}
              >
                {statusLabel(r.status)}
              </span>
              {r.decidedAt && (
                <span className="font-mono text-[11px] text-[var(--text-muted)]">
                  {timeAgo(r.decidedAt)}
                </span>
              )}
            </div>
            {r.status === "handled" && (
              <button
                onClick={onUndo}
                disabled={busy}
                title="Move this request back to Pending"
                aria-label="Undo — move this request back to Pending"
                className="press inline-flex min-h-10 items-center gap-1.5 rounded-md border border-[var(--border-strong)] bg-[var(--surface-raised)] px-3 py-1.5 text-[12px] font-medium text-[var(--text-secondary)] hover:border-[var(--accent-ring)] hover:bg-[var(--accent-soft)] hover:text-[var(--text-primary)] disabled:opacity-50 sm:min-h-8"
              >
                <IconUndo className="h-3.5 w-3.5" />
                Undo
              </button>
            )}
          </div>
        )}
      </div>

      {isPending && (
        <div className="mt-3 flex items-center gap-2 sm:hidden">
          <button
            onClick={() => onDecide("approved")}
            disabled={busy}
            className="accent press inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-md text-[13px] font-semibold disabled:opacity-50"
          >
            <IconCheck className="h-3.5 w-3.5" />
            Approve
          </button>
          <button
            onClick={() => onDecide("rejected")}
            disabled={busy}
            className="press inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-md border border-[var(--border)] text-[13px] font-medium text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--c-rose)] disabled:opacity-50"
          >
            <IconX className="h-3.5 w-3.5" />
            Reject
          </button>
          <button
            onClick={onMark}
            disabled={busy}
            aria-label="Mark as handled — no mail sent"
            className="press inline-flex h-10 shrink-0 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface-sunken)] px-3 text-[13px] font-medium text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] disabled:opacity-50"
          >
            Handled
          </button>
        </div>
      )}
    </article>
  );
}
