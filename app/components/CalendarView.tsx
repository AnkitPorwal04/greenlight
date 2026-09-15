import { useEffect, useMemo, useState } from "react";
import { IconAlert, IconChevron } from "./icons";
import { avatarTone, initials, leaveTypeStyle, statusLabel } from "./utils";
import {
  addDaysYmd,
  isValidYmd,
  longDateFromYmd,
  todayYmd,
} from "@/lib/leave-dates";
import {
  presentOnDay,
  splitDayLeaves,
  type CalendarLeave,
  type CalendarRosterMember,
  type DayPresence,
} from "@/lib/calendar";

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

type PresenceBucket = "present" | "wfh" | "absent";

const PRESENCE_TABS: {
  key: PresenceBucket;
  label: string;
  lamp: string;
  empty: string;
}[] = [
  {
    key: "present",
    label: "Present",
    lamp: "lamp-green",
    empty: "No one on your team is at work that day.",
  },
  {
    key: "wfh",
    label: "WFH",
    lamp: "lamp-sky",
    empty: "No one is working from home that day.",
  },
  {
    key: "absent",
    label: "Absent",
    lamp: "lamp-amber",
    empty: "No one on your team is away that day.",
  },
];

function OnDutyPanel({ presence }: { presence: DayPresence }) {
  const [bucket, setBucket] = useState<PresenceBucket>("present");
  const active = PRESENCE_TABS.find((t) => t.key === bucket) ?? PRESENCE_TABS[0];
  const people = presence[active.key];

  return (
    <section className="lg:self-start">
      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-4 py-3">
        <h3 className="text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--text-muted)]">
          Team
        </h3>
        <div className="mt-2.5 flex flex-wrap items-center gap-x-1 gap-y-1 border-b border-[var(--border)] pb-2.5">
          {PRESENCE_TABS.map((tab) => {
            const selected = tab.key === active.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setBucket(tab.key)}
                aria-pressed={selected}
                className={`press inline-flex items-center gap-1.5 rounded px-1.5 py-1 text-[11px] transition ${
                  selected
                    ? "bg-[var(--surface)] font-semibold text-[var(--text-primary)]"
                    : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`lamp-dot h-[5px] w-[5px] shrink-0 ${tab.lamp}`}
                />
                {tab.label}
                <span className="font-mono tabular-nums">
                  {presence[tab.key].length}
                </span>
              </button>
            );
          })}
        </div>
        {people.length === 0 ? (
          <p className="py-4 text-center text-[12px] text-[var(--text-muted)]">
            {active.empty}
          </p>
        ) : (
          <ul className="flex flex-wrap gap-1.5 pt-2.5">
            {people.map((member) => (
              <li
                key={member.code}
                className="inline-flex max-w-full items-center rounded border border-[var(--border-strong)] px-1.5 py-0.5 text-[11px] text-[var(--text-secondary)]"
              >
                <span className="truncate">{member.name}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

export function CalendarView() {
  const [leaves, setLeaves] = useState<CalendarLeave[]>([]);
  const [roster, setRoster] = useState<CalendarRosterMember[]>([]);
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
        setRoster(Array.isArray(data.roster) ? data.roster : []);
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
  const presence = useMemo(() => presentOnDay(roster, onDay), [roster, onDay]);
  const showDuty =
    presence.present.length + presence.wfh.length + presence.absent.length > 0;

  const daySections =
    onDay.total === 0 ? (
      <p className="py-10 text-center text-[13px] text-[var(--text-muted)]">
        No one on your team is on leave that day.
      </p>
    ) : (
      <div className="space-y-8">
        <DaySection title="Approved" lamp="lamp-green" leaves={onDay.approved} />
        <DaySection title="Pending" lamp="lamp-amber" leaves={onDay.pending} />
      </div>
    );

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
      ) : showDuty ? (
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_16rem] lg:gap-10">
          {daySections}
          <OnDutyPanel presence={presence} />
        </div>
      ) : (
        daySections
      )}
    </div>
  );
}
