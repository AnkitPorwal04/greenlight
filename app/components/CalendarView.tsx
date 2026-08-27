import { useEffect, useMemo, useState } from "react";
import { IconAlert, IconChevron } from "./icons";
import { avatarTone, initials, leaveTypeStyle, statusLabel } from "./utils";
import {
  addDaysYmd,
  isValidYmd,
  longDateFromYmd,
  todayYmd,
} from "@/lib/leave-dates";
import { splitDayLeaves, type CalendarLeave } from "@/lib/calendar";

function PersonRow({ leave }: { leave: CalendarLeave }) {
  const type = leave.leaveType || "Leave";
  return (
    <div className="flex items-center gap-3 px-1 py-3.5">
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${avatarTone(
          leave.employeeName
        )}`}
      >
        {initials(leave.employeeName)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2.5">
          <span className="truncate text-[14px] font-semibold text-[var(--text-primary)]">
            {leave.employeeName}
          </span>
          <span className="font-mono text-[11px] uppercase tracking-wide text-[var(--text-muted)]">
            {leave.employeeCode}
          </span>
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px]">
          <span className={`font-medium ${leaveTypeStyle(type)}`}>{type}</span>
          <span className="text-[var(--text-muted)]">·</span>
          <span className="font-mono text-[var(--text-secondary)]">
            {leave.fromDate === leave.toDate
              ? leave.fromDate
              : `${leave.fromDate} – ${leave.toDate}`}
          </span>
        </div>
      </div>
      <span className="shrink-0 font-mono text-[11px] uppercase tracking-wide text-[var(--text-muted)]">
        {statusLabel(leave.status)}
      </span>
    </div>
  );
}

function DaySection({
  title,
  lamp,
  leaves,
}: {
  title: string;
  lamp: string;
  leaves: CalendarLeave[];
}) {
  if (leaves.length === 0) return null;
  return (
    <section>
      <div className="flex items-baseline justify-between gap-x-6 pb-2">
        <h3 className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--text-muted)]">
          <span
            aria-hidden="true"
            className={`lamp-dot h-[5px] w-[5px] shrink-0 ${lamp}`}
          />
          {title}
        </h3>
        <span className="font-mono text-[11px] tabular-nums text-[var(--text-muted)]">
          {leaves.length}
        </span>
      </div>
      <div className="divide-y divide-[var(--border)] border-y border-[var(--border)]">
        {leaves.map((l) => (
          <PersonRow key={l.id} leave={l} />
        ))}
      </div>
    </section>
  );
}

export function CalendarView() {
  const [leaves, setLeaves] = useState<CalendarLeave[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [day, setDay] = useState<string>(() => todayYmd());

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

  const onDay = useMemo(() => splitDayLeaves(leaves, day), [leaves, day]);

  return (
    <div>
      {/* Date picker */}
      <div className="mb-8 flex flex-wrap items-center gap-3">
        <button
          onClick={() => setDay((d) => addDaysYmd(d, -1))}
          aria-label="Previous day"
          className="press flex h-10 w-10 items-center justify-center rounded-md border border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
        >
          <IconChevron className="h-4 w-4 rotate-90" />
        </button>
        <input
          type="date"
          value={day}
          onChange={(e) => {
            if (isValidYmd(e.target.value)) setDay(e.target.value);
          }}
          aria-label="Pick a day"
          className="field rounded-md px-3 py-2 font-mono text-[13px]"
        />
        <button
          onClick={() => setDay((d) => addDaysYmd(d, 1))}
          aria-label="Next day"
          className="press flex h-10 w-10 items-center justify-center rounded-md border border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
        >
          <IconChevron className="h-4 w-4 -rotate-90" />
        </button>
        <button
          onClick={() => setDay(todayYmd())}
          className="press rounded-md px-3 py-2 text-[13px] font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)]"
        >
          Today
        </button>
      </div>

      {/* Count headline */}
      <div className="mb-6 flex items-baseline gap-3 border-b border-[var(--border)] pb-4">
        <span className="font-mono text-[32px] font-medium leading-none tabular-nums text-[var(--text-primary)] sm:text-[40px]">
          {loading ? "–" : onDay.total}
        </span>
        <span className="text-[13px] text-[var(--text-muted)]">
          {onDay.total === 1 ? "person on leave" : "people on leave"} on{" "}
          {longDateFromYmd(day)}
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
      ) : onDay.total === 0 ? (
        <p className="py-10 text-center text-[13px] text-[var(--text-muted)]">
          No one on your team is on leave that day.
        </p>
      ) : (
        <div className="space-y-8">
          <DaySection
            title="Approved"
            lamp="lamp-green"
            leaves={onDay.approved}
          />
          <DaySection title="Pending" lamp="lamp-amber" leaves={onDay.pending} />
        </div>
      )}
    </div>
  );
}
