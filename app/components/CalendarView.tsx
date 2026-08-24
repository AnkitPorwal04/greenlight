import { useEffect, useMemo, useState } from "react";
import { IconAlert, IconChevron } from "./icons";
import { avatarTone, initials, leaveTypeStyle, statusLabel } from "./utils";
import {
  fromDayInput,
  leaveCoversDay,
  startOfDayMs,
  toDayInput,
} from "@/lib/leave-dates";

interface CalendarLeave {
  id: string;
  employeeName: string;
  employeeCode: string;
  leaveType: string;
  status: string;
  fromDate: string;
  toDate: string;
  fromMs: number;
  toMs: number;
  numberOfDays: number;
}

const DAY = 86_400_000;

function longDate(ms: number): string {
  return new Date(ms).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export function CalendarView() {
  const [leaves, setLeaves] = useState<CalendarLeave[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [day, setDay] = useState<number>(() => startOfDayMs(Date.now()));

  useEffect(() => {
    let cancelled = false;
    fetch("/api/calendar")
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data.error) {
          setError(
            data.error === "not_connected"
              ? "Gmail is not connected"
              : data.error
          );
          return;
        }
        setLeaves(Array.isArray(data.leaves) ? data.leaves : []);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load the calendar");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const onDay = useMemo(
    () =>
      leaves
        .filter((l) => leaveCoversDay(l.fromMs, l.toMs, day))
        .sort((a, b) => a.employeeName.localeCompare(b.employeeName)),
    [leaves, day]
  );

  return (
    <div>
      {/* Date picker */}
      <div className="mb-8 flex flex-wrap items-center gap-3">
        <button
          onClick={() => setDay((d) => startOfDayMs(d - DAY))}
          aria-label="Previous day"
          className="press flex h-10 w-10 items-center justify-center rounded-md border border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
        >
          <IconChevron className="h-4 w-4 rotate-90" />
        </button>
        <input
          type="date"
          value={toDayInput(day)}
          onChange={(e) => {
            const ms = fromDayInput(e.target.value);
            if (ms !== null) setDay(ms);
          }}
          aria-label="Pick a day"
          className="field rounded-md px-3 py-2 font-mono text-[13px]"
        />
        <button
          onClick={() => setDay((d) => startOfDayMs(d + DAY))}
          aria-label="Next day"
          className="press flex h-10 w-10 items-center justify-center rounded-md border border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
        >
          <IconChevron className="h-4 w-4 -rotate-90" />
        </button>
        <button
          onClick={() => setDay(startOfDayMs(Date.now()))}
          className="press rounded-md px-3 py-2 text-[13px] font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)]"
        >
          Today
        </button>
      </div>

      {/* Count headline */}
      <div className="mb-6 flex items-baseline gap-3 border-b border-[var(--border)] pb-4">
        <span className="font-mono text-[32px] font-medium leading-none tabular-nums text-[var(--text-primary)] sm:text-[40px]">
          {loading ? "–" : onDay.length}
        </span>
        <span className="text-[13px] text-[var(--text-muted)]">
          {onDay.length === 1 ? "person on leave" : "people on leave"} on{" "}
          {longDate(day)}
        </span>
      </div>

      {error ? (
        <p className="flex items-start gap-2 border-l-2 border-[var(--signal-red)] py-1 pl-3 text-[13px] text-[var(--c-rose)]">
          <IconAlert className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </p>
      ) : loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-12 w-full rounded" />
          ))}
        </div>
      ) : onDay.length === 0 ? (
        <p className="py-10 text-center text-[13px] text-[var(--text-muted)]">
          No one on your team is on leave that day.
        </p>
      ) : (
        <div className="divide-y divide-[var(--border)] border-y border-[var(--border)]">
          {onDay.map((l) => {
            const type = l.leaveType || "Leave";
            return (
              <div key={l.id} className="flex items-center gap-3 px-1 py-3.5">
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${avatarTone(
                    l.employeeName
                  )}`}
                >
                  {initials(l.employeeName)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2.5">
                    <span className="truncate text-[14px] font-semibold text-[var(--text-primary)]">
                      {l.employeeName}
                    </span>
                    <span className="font-mono text-[11px] uppercase tracking-wide text-[var(--text-muted)]">
                      {l.employeeCode}
                    </span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px]">
                    <span className={`font-medium ${leaveTypeStyle(type)}`}>
                      {type}
                    </span>
                    <span className="text-[var(--text-muted)]">·</span>
                    <span className="font-mono text-[var(--text-secondary)]">
                      {l.fromDate === l.toDate
                        ? l.fromDate
                        : `${l.fromDate} – ${l.toDate}`}
                    </span>
                  </div>
                </div>
                <span className="shrink-0 font-mono text-[11px] uppercase tracking-wide text-[var(--text-muted)]">
                  {statusLabel(l.status)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
