"use client";

import { useId, useMemo, useState } from "react";
import {
  aggregateStats,
  buildStatsMonths,
  chartTicks,
  dailyLeaveCounts,
  entriesInMonth,
  fillTeamRoster,
  narrowDayLabels,
  statsMonthKey,
  statsMonthLabel,
  statsMonthShortLabel,
  topDaysByType,
  type DailyLeavePoint,
  type StatsEmployee,
  type StatsEmployeeEntry,
  type StatsOutcome,
  type StatsPayload,
} from "@/lib/stats";
import { smoothAreaPath, smoothLinePath } from "@/lib/chart";
import { formatLeaveDate } from "@/lib/leave-dates";
import { ArtTray, EmptyState } from "./States";
import {
  IconAlert,
  IconChevron,
  IconRefresh,
  IconSearch,
  IconX,
} from "./icons";
import { MonthTabs } from "./Shell";
import { avatarTone, initials, leaveTypeColor, leaveTypeShort } from "./utils";

const TOP_PEOPLE = 10;

const CHART_WIDTH = 300;
const CHART_HEIGHT = 88;
const CHART_TOP = 6;
const CHART_BASELINE = 82;
const PLOT_HEIGHT = "h-28 sm:h-36";

function Label({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--text-muted)]">
      {children}
    </h2>
  );
}

function Swatch({ color }: { color: string }) {
  return (
    <span
      aria-hidden="true"
      className="lamp-dot h-[5px] w-[5px] shrink-0"
      style={{ background: color }}
    />
  );
}

function formatShortDay(iso: string) {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

function formatNumber(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function memberKey(person: { code: string; name: string }) {
  return `${person.code}-${person.name}`;
}

function breakdown(daysByType: Record<string, number>) {
  return topDaysByType(daysByType)
    .map((row) => `${formatNumber(row.days)} ${leaveTypeShort(row.type)}`)
    .join(" · ");
}

const OUTCOMES: {
  key: StatsOutcome;
  label: string;
  lamp: string;
  tone: string;
}[] = [
  {
    key: "approved",
    label: "approved",
    lamp: "lamp-green",
    tone: "text-[var(--c-emerald)]",
  },
  {
    key: "rejected",
    label: "rejected",
    lamp: "lamp-red",
    tone: "text-[var(--c-rose)]",
  },
  {
    key: "pending",
    label: "pending",
    lamp: "lamp-amber",
    tone: "text-[var(--c-amber)]",
  },
  {
    key: "handled",
    label: "handled",
    lamp: "",
    tone: "text-[var(--text-muted)]",
  },
];

const OUTCOME_BY_KEY = OUTCOMES.reduce(
  (map, o) => {
    map[o.key] = o;
    return map;
  },
  {} as Record<StatsOutcome, (typeof OUTCOMES)[number]>
);

function overviewItems(data: StatsPayload, monthLabel: string) {
  return [
    { label: "Applied", value: String(data.outcomes.applied) },
    { label: "People", value: String(data.byEmployee.length) },
    { label: "Leave types", value: String(data.byType.length) },
    { label: "Month", value: monthLabel },
  ];
}

function Overview({
  data,
  monthLabel,
}: {
  data: StatsPayload;
  monthLabel: string;
}) {
  return (
    <section
      aria-label="Overview"
      className="border-y border-[var(--border)] py-5"
    >
      <dl className="grid grid-cols-2 gap-x-4 gap-y-6 sm:-ml-10 sm:flex sm:flex-wrap sm:items-stretch sm:gap-0">
        {overviewItems(data, monthLabel).map((item) => (
          <div
            key={item.label}
            className="min-w-0 sm:flex-none sm:border-l sm:border-[var(--border)] sm:px-10"
          >
            <dd className="font-mono text-[22px] font-medium leading-none tracking-tight tabular-nums text-[var(--text-primary)] sm:text-[28px]">
              {item.value}
            </dd>
            <dt className="mt-2 flex items-center gap-1.5 whitespace-nowrap text-[10px] font-medium uppercase tracking-[0.16em] text-[var(--text-muted)]">
              {item.label}
            </dt>
          </div>
        ))}
      </dl>
    </section>
  );
}

function OutcomeChips({ person }: { person: StatsEmployee }) {
  const shown = OUTCOMES.filter((o) => person.daysByOutcome[o.key] > 0);
  if (shown.length === 0) return null;

  return (
    <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
      {shown.map((o) => {
        const days = person.daysByOutcome[o.key];
        return (
          <span
            key={o.key}
            title={`${formatNumber(days)} ${
              days === 1 ? "day" : "days"
            } ${o.label}`}
            className={`flex items-center gap-1.5 text-[11px] ${o.tone}`}
          >
            <span
              aria-hidden="true"
              className={`lamp-dot h-[5px] w-[5px] shrink-0 ${o.lamp}`}
            />
            <span className="font-mono tabular-nums">{formatNumber(days)}</span>
            <span className="sr-only sm:not-sr-only">{o.label}</span>
          </span>
        );
      })}
    </span>
  );
}

function EntryRow({
  entry,
  color,
}: {
  entry: StatsEmployeeEntry;
  color: string;
}) {
  const outcome = OUTCOME_BY_KEY[entry.status];
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5 text-[13px]">
      <span className="w-14 shrink-0 font-mono text-[11px] tabular-nums text-[var(--text-muted)]">
        {formatShortDay(entry.receivedAt)}
      </span>
      <span
        title={entry.leaveType}
        className="shrink-0 rounded-[3px] border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide"
        style={{
          color,
          borderColor: `color-mix(in srgb, ${color} 35%, transparent)`,
          background: `color-mix(in srgb, ${color} 10%, transparent)`,
        }}
      >
        {leaveTypeShort(entry.leaveType)}
      </span>
      <span className="shrink-0 font-mono text-[12px] tabular-nums text-[var(--text-secondary)]">
        {formatNumber(entry.numberOfDays)}d
      </span>
      <span
        className={`ml-auto flex shrink-0 items-center gap-1.5 text-[12px] ${outcome.tone}`}
      >
        <span
          aria-hidden="true"
          className={`lamp-dot h-[5px] w-[5px] shrink-0 ${outcome.lamp}`}
        />
        {outcome.label}
      </span>
    </li>
  );
}

function EntryList({
  id,
  entries,
  typeIndex,
}: {
  id: string;
  entries: StatsEmployeeEntry[];
  typeIndex: Map<string, number>;
}) {
  if (entries.length === 0) return null;

  return (
    <div id={id} className="rise-in pb-4 pl-8 sm:pl-[88px]">
      <ul className="divide-y divide-[var(--border)] border-l border-[var(--border)] pl-3 sm:pl-4">
        {entries.map((entry, i) => (
          <EntryRow
            key={`${entry.receivedAt}-${i}`}
            entry={entry}
            color={leaveTypeColor(
              entry.leaveType,
              typeIndex.get(entry.leaveType) ?? i
            )}
          />
        ))}
      </ul>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="mt-10 space-y-12">
      <div className="space-y-4">
        <div className="skeleton h-3 w-36 rounded" />
        <div className="flex items-stretch gap-1.5">
          <div className={`skeleton w-5 shrink-0 rounded sm:w-6 ${PLOT_HEIGHT}`} />
          <div className="min-w-0 flex-1 space-y-2">
            <div className={`skeleton w-full rounded ${PLOT_HEIGHT}`} />
            <div className="skeleton h-2.5 w-full rounded" />
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="skeleton h-3 w-28 rounded" />
        <div className="border-y border-[var(--border)] py-5">
          <div className="skeleton h-24 w-full rounded" />
        </div>
      </div>

      <div className="space-y-4">
        <div className="skeleton h-3 w-36 rounded" />
        <div className="divide-y divide-[var(--border)] border-y border-[var(--border)]">
          {[0, 1, 2, 3, 4].map((row) => (
            <div key={row} className="flex items-center gap-3 py-4">
              <div className="skeleton h-9 w-9 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="skeleton h-3.5 w-full max-w-40 rounded" />
                <div className="skeleton h-[3px] w-full max-w-72 rounded" />
              </div>
              <div className="skeleton h-7 w-10 shrink-0 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TopTakers({ data }: { data: StatsPayload }) {
  const uid = useId();
  const [open, setOpen] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const typeIndex = useMemo(
    () => new Map(data.byType.map((t, i) => [t.type, i] as const)),
    [data]
  );

  const people = showAll
    ? data.byEmployee
    : data.byEmployee.slice(0, TOP_PEOPLE);
  const hidden = data.byEmployee.length - TOP_PEOPLE;
  if (people.length === 0) return null;
  const max = people.reduce((peak, p) => Math.max(peak, p.days), 0);

  return (
    <section className="mt-14">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <Label>Top leave-takers</Label>
        <span className="font-mono text-[11px] tabular-nums text-[var(--text-muted)]">
          by days
        </span>
      </div>

      <ol className="mt-5 divide-y divide-[var(--border)] border-y border-[var(--border)]">
        {people.map((person, i) => {
          const key = `${person.code}-${person.name}`;
          const panelId = `${uid}-${i}`;
          const isOpen = open === key;
          return (
            <li key={key}>
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : key)}
                aria-expanded={isOpen}
                aria-controls={isOpen ? panelId : undefined}
                className="press group flex w-full items-center gap-3 py-4 text-left sm:gap-4"
              >
                <span className="w-5 shrink-0 font-mono text-[11px] tabular-nums text-[var(--text-muted)]">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold tracking-wide ${avatarTone(
                    person.name
                  )}`}
                >
                  {initials(person.name)}
                </span>
                <span className="block min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                    <span className="min-w-0 max-w-full truncate text-[14px] font-semibold tracking-tight text-[var(--text-primary)]">
                      {person.name}
                    </span>
                    <span className="min-w-0 truncate font-mono text-[11px] uppercase tracking-wide text-[var(--text-muted)]">
                      {person.code}
                    </span>
                  </span>
                  <span className="mt-2 block h-[3px] w-full max-w-md overflow-hidden rounded-full bg-[var(--surface-raised)]">
                    <span
                      className="block h-full rounded-full bg-[var(--accent)]"
                      style={{
                        width: max > 0 ? `${(person.days / max) * 100}%` : "0%",
                      }}
                    />
                  </span>
                  <span className="mt-2 block font-mono text-[11px] text-[var(--text-muted)]">
                    {breakdown(person.daysByType) ||
                      `${person.requests} ${
                        person.requests === 1 ? "request" : "requests"
                      }`}
                  </span>
                  <OutcomeChips person={person} />
                </span>
                <span className="block shrink-0 text-right">
                  <span className="block font-mono text-[24px] font-medium leading-none tracking-tight tabular-nums text-[var(--text-primary)] sm:text-[28px]">
                    {formatNumber(person.days)}
                  </span>
                  <span className="mt-2 block text-[10px] font-medium uppercase tracking-[0.16em] text-[var(--text-muted)]">
                    days
                  </span>
                </span>
                <IconChevron
                  className={`h-3.5 w-3.5 shrink-0 text-[var(--text-muted)] transition-transform duration-200 group-hover:text-[var(--text-secondary)] ${
                    isOpen ? "rotate-180" : ""
                  }`}
                />
              </button>
              {isOpen && (
                <EntryList
                  id={panelId}
                  entries={person.entries}
                  typeIndex={typeIndex}
                />
              )}
            </li>
          );
        })}
      </ol>

      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setShowAll(!showAll)}
          aria-expanded={showAll}
          className="press mt-4 inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-wide text-[var(--text-muted)] hover:text-[var(--text-primary)]"
        >
          <span
            aria-hidden="true"
            className={`lamp-dot h-[5px] w-[5px] shrink-0 ${
              showAll ? "" : "lamp-hollow"
            }`}
          />
          {showAll ? (
            "Show less"
          ) : (
            <>
              Show all
              <span className="tabular-nums">{data.byEmployee.length}</span>
            </>
          )}
        </button>
      )}
    </section>
  );
}

function MemberLookup({ data }: { data: StatsPayload }) {
  const [query, setQuery] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [month, setMonth] = useState<string | null>(null);

  const typeIndex = useMemo(
    () => new Map(data.byType.map((t, i) => [t.type, i] as const)),
    [data]
  );

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return data.byEmployee
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [data, query]);

  const selected = useMemo(
    () =>
      selectedKey
        ? (data.byEmployee.find((p) => memberKey(p) === selectedKey) ?? null)
        : null,
    [data, selectedKey]
  );

  // Months this member has activity in, newest first.
  const months = useMemo(() => {
    if (!selected) return [];
    const seen = new Set<string>();
    for (const e of selected.entries) {
      const key = statsMonthKey(e.receivedAt);
      if (key) seen.add(key);
    }
    return [...seen].sort((a, b) => b.localeCompare(a));
  }, [selected]);

  // Fall back to the latest month whenever the picked one isn't valid for
  // this member (e.g. right after switching members).
  const activeMonth =
    month && months.includes(month) ? month : (months[0] ?? null);

  const monthEntries = useMemo(
    () =>
      selected && activeMonth
        ? selected.entries.filter(
            (e) => statsMonthKey(e.receivedAt) === activeMonth
          )
        : [],
    [selected, activeMonth]
  );

  const takenDays = monthEntries.reduce((sum, e) => sum + e.numberOfDays, 0);

  if (data.byEmployee.length === 0) return null;

  const pick = (person: StatsEmployee) => {
    setSelectedKey(memberKey(person));
    setMonth(null);
    setQuery("");
  };

  return (
    <section className="mt-14">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <Label>Member lookup</Label>
        <span className="font-mono text-[11px] tabular-nums text-[var(--text-muted)]">
          all months · {data.byEmployee.length}{" "}
          {data.byEmployee.length === 1 ? "member" : "members"}
        </span>
      </div>

      <div className="relative mt-5 max-w-sm">
        <IconSearch className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search any member by name or code"
          aria-label="Search member by name or employee code"
          className="field w-full rounded-md py-2 pl-8 pr-10 text-[13px] transition"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Clear search"
            className="press absolute right-0.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded text-[var(--text-muted)] transition hover:text-[var(--text-primary)]"
          >
            <IconX className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {query.trim() &&
        (matches.length > 0 ? (
          <ul className="mt-2 max-w-sm divide-y divide-[var(--border)] overflow-hidden rounded-md border border-[var(--border)]">
            {matches.map((person) => (
              <li key={memberKey(person)}>
                <button
                  type="button"
                  onClick={() => pick(person)}
                  className="press flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-[var(--surface-raised)]"
                >
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${avatarTone(
                      person.name
                    )}`}
                  >
                    {initials(person.name)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-[var(--text-primary)]">
                      {person.name}
                    </span>
                    <span className="block truncate font-mono text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                      {person.code}
                    </span>
                  </span>
                  <span className="shrink-0 font-mono text-[11px] tabular-nums text-[var(--text-muted)]">
                    {formatNumber(person.days)}d
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-[12px] text-[var(--text-muted)]">
            No member’s name or code contains “{query.trim()}”.
          </p>
        ))}

      {selected && (
        <div className="rise-in mt-6 rounded-lg border border-[var(--border)] p-4 sm:p-5">
          <div className="flex items-center gap-3">
            <span
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold ${avatarTone(
                selected.name
              )}`}
            >
              {initials(selected.name)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-semibold tracking-tight text-[var(--text-primary)]">
                {selected.name}
              </span>
              <span className="block truncate font-mono text-[11px] uppercase tracking-wide text-[var(--text-muted)]">
                {selected.code}
              </span>
            </span>
            <button
              type="button"
              onClick={() => setSelectedKey(null)}
              className="press shrink-0 rounded-md border border-[var(--border-strong)] px-2.5 py-1 text-[11px] text-[var(--text-secondary)] transition hover:border-[var(--accent-ring)] hover:text-[var(--text-primary)]"
            >
              Change
            </button>
          </div>

          {months.length > 0 ? (
            <>
              <div className="mt-4 flex flex-wrap gap-2">
                {months.map((key) => {
                  const on = key === activeMonth;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setMonth(key)}
                      aria-pressed={on}
                      className={`press rounded-full border px-3 py-1 font-mono text-[11px] uppercase tracking-wide transition ${
                        on
                          ? "border-[var(--accent-ring)] bg-[var(--accent-soft)] text-[var(--text-primary)]"
                          : "border-[var(--border-strong)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                      }`}
                    >
                      {statsMonthShortLabel(key)}
                    </button>
                  );
                })}
              </div>

              <div className="mt-5 flex flex-wrap items-baseline gap-x-2 gap-y-1 border-t border-[var(--border)] pt-4">
                <span className="font-mono text-[24px] font-medium leading-none tracking-tight tabular-nums text-[var(--text-primary)]">
                  {monthEntries.length}
                </span>
                <span className="text-[12px] text-[var(--text-secondary)]">
                  {monthEntries.length === 1 ? "leave" : "leaves"} taken
                </span>
                <span className="text-[var(--text-muted)]">·</span>
                <span className="font-mono text-[13px] tabular-nums text-[var(--text-secondary)]">
                  {formatNumber(takenDays)} days
                </span>
              </div>

              <ul className="mt-2 divide-y divide-[var(--border)]">
                {monthEntries.map((entry, i) => (
                  <EntryRow
                    key={`${entry.receivedAt}-${i}`}
                    entry={entry}
                    color={leaveTypeColor(
                      entry.leaveType,
                      typeIndex.get(entry.leaveType) ?? i
                    )}
                  />
                ))}
              </ul>
            </>
          ) : (
            <p className="mt-4 text-[12px] text-[var(--text-muted)]">
              No leave requests recorded for this member.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function ByType({ data }: { data: StatsPayload }) {
  if (data.byType.length === 0) return null;
  return (
    <section className="mt-14">
      <Label>By type</Label>
      <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-6 border-y border-[var(--border)] py-6 sm:flex sm:flex-wrap sm:gap-y-8">
        {data.byType.map((row, i) => (
          <div key={row.type} className="min-w-0 sm:w-44">
            <dd className="font-mono text-[24px] font-medium leading-none tracking-tight tabular-nums text-[var(--text-primary)]">
              {row.requests}
            </dd>
            <dt className="mt-2 flex items-center gap-1.5 text-[11px] text-[var(--text-secondary)]">
              <Swatch color={leaveTypeColor(row.type, i)} />
              <span className="min-w-0 truncate">{row.type}</span>
            </dt>
            <p className="mt-1 pl-3 font-mono text-[11px] tabular-nums text-[var(--text-muted)]">
              {formatNumber(row.days)} days
            </p>
          </div>
        ))}
      </dl>
    </section>
  );
}

function DailyPattern({
  points,
  monthLabel,
}: {
  points: DailyLeavePoint[];
  monthLabel: string;
}) {
  const titleId = useId();
  const fillId = useId();
  if (points.length === 0) return null;

  const busiestIndex = points.reduce(
    (best, point, i) => (point.people > points[best].people ? i : best),
    0
  );
  const busiest = points[busiestIndex];
  const peak = busiest.people;

  const ticks = chartTicks(peak);
  const ceiling = ticks[ticks.length - 1];
  const showOnNarrow = narrowDayLabels(points.length);

  const atDay = (index: number) =>
    ((index + 0.5) / points.length) * CHART_WIDTH;
  const atPeople = (people: number) =>
    CHART_BASELINE - (people / ceiling) * (CHART_BASELINE - CHART_TOP);
  const downFromTop = (y: number) => `${((y / CHART_HEIGHT) * 100).toFixed(3)}%`;

  const plotted = points.map((point, i) => ({
    x: atDay(i),
    y: atPeople(point.people),
  }));
  const line = smoothLinePath(plotted);
  const under = smoothAreaPath(plotted, CHART_BASELINE);

  const summary =
    peak > 0
      ? `People on leave each day of ${monthLabel}. Busiest day ${formatLeaveDate(
          busiest.ymd
        )} with ${peak} ${peak === 1 ? "person" : "people"} off.`
      : `People on leave each day of ${monthLabel}. Nobody was off on any day.`;

  return (
    <section className="border-t border-[var(--border)] pb-6 pt-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <Label>People off each day</Label>
        <span className="font-mono text-[11px] tabular-nums text-[var(--text-muted)]">
          peak {peak}
        </span>
      </div>

      <div className="mt-4 flex items-stretch gap-1.5">
        <div
          aria-hidden="true"
          className={`relative w-5 shrink-0 sm:w-6 ${PLOT_HEIGHT}`}
        >
          {ticks.map((tick) => (
            <span
              key={tick}
              className="absolute right-0 -translate-y-1/2 font-mono text-[10px] leading-none tabular-nums text-[var(--text-muted)]"
              style={{ top: downFromTop(atPeople(tick)) }}
            >
              {tick}
            </span>
          ))}
        </div>

        <div className="min-w-0 flex-1">
          <div className={PLOT_HEIGHT}>
            <svg
              role="img"
              aria-label={summary}
              viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
              preserveAspectRatio="none"
              className="block h-full w-full"
            >
              <title id={titleId}>{summary}</title>
              <defs>
                <linearGradient
                  id={fillId}
                  gradientUnits="userSpaceOnUse"
                  x1="0"
                  y1={CHART_TOP}
                  x2="0"
                  y2={CHART_BASELINE}
                >
                  <stop
                    offset="0%"
                    stopColor="var(--accent-soft)"
                    stopOpacity="1"
                  />
                  <stop
                    offset="60%"
                    stopColor="var(--accent-soft)"
                    stopOpacity="0.45"
                  />
                  <stop
                    offset="100%"
                    stopColor="var(--accent-soft)"
                    stopOpacity="0"
                  />
                </linearGradient>
              </defs>
              {ticks.map((tick) => (
                <line
                  key={tick}
                  x1="0"
                  y1={atPeople(tick).toFixed(2)}
                  x2={CHART_WIDTH}
                  y2={atPeople(tick).toFixed(2)}
                  stroke={tick === 0 ? "var(--border-strong)" : "var(--border)"}
                  strokeWidth="1"
                  strokeOpacity={tick === 0 ? 0.7 : 0.4}
                  strokeDasharray={tick === 0 ? undefined : "2 5"}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              <path d={under} fill={`url(#${fillId})`} />
              <path
                d={line}
                fill="none"
                stroke="var(--accent)"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          </div>

          <div
            className="mt-2 grid"
            style={{
              gridTemplateColumns: `repeat(${points.length}, minmax(0, 1fr))`,
            }}
          >
            {points.map((point, i) => (
              <span
                key={point.ymd}
                className={`whitespace-nowrap text-center font-mono text-[10px] leading-none tabular-nums text-[var(--text-muted)] ${
                  showOnNarrow[i] ? "" : "hidden sm:block"
                }`}
              >
                {point.day}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function MonthScopedStats({
  data,
  loading,
}: {
  data: StatsPayload;
  loading: boolean;
}) {
  const [picked, setPicked] = useState<string | null>(null);

  const { months, currentKey } = useMemo(() => {
    const now = new Date();
    return {
      months: buildStatsMonths(data.entries, now),
      currentKey: statsMonthKey(now.toISOString()),
    };
  }, [data]);

  const fallbackKey = months.some((m) => m.key === currentKey)
    ? currentKey
    : (months[0]?.key ?? "");
  const activeKey =
    picked && months.some((m) => m.key === picked) ? picked : fallbackKey;

  const monthData = useMemo(() => {
    const scoped = aggregateStats(entriesInMonth(data.entries, activeKey));
    return {
      ...scoped,
      byEmployee: fillTeamRoster(scoped.byEmployee, data.roster),
    };
  }, [data, activeKey]);

  const dailyPoints = useMemo(
    () => dailyLeaveCounts(data.entries, activeKey),
    [data, activeKey]
  );

  return (
    <div className={loading ? "opacity-60 transition-opacity" : ""}>
      <MonthTabs
        months={months}
        active={activeKey}
        onSelect={setPicked}
        label="Stats month"
      />

      {monthData.totalRequests === 0 ? (
        <div className="border-t border-[var(--border)]">
          <EmptyState
            art={<ArtTray />}
            title={`Nothing applied for in ${statsMonthLabel(activeKey)}`}
            hint="Pick another month to see what your team took off."
          />
        </div>
      ) : (
        <>
          <DailyPattern
            points={dailyPoints}
            monthLabel={statsMonthLabel(activeKey)}
          />
          <Overview
            data={monthData}
            monthLabel={statsMonthShortLabel(activeKey)}
          />
          <TopTakers data={monthData} />
          <ByType data={monthData} />
        </>
      )}

      <MemberLookup data={data} />
    </div>
  );
}

export function StatsView({
  data,
  loading,
  error,
  onRetry,
}: {
  data: StatsPayload | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  if (error && !data) {
    return (
      <div className="mt-10">
        <p className="flex items-start gap-2 border-l-2 border-[var(--signal-red)] py-1 pl-3 text-[13px] text-[var(--c-rose)]">
          <IconAlert className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </p>
        <button
          onClick={onRetry}
          className="press mt-5 inline-flex min-h-10 items-center gap-2 rounded-md border border-[var(--border-strong)] bg-[var(--surface-raised)] px-3 py-1.5 text-[12px] font-medium text-[var(--text-secondary)] hover:border-[var(--accent-ring)] hover:bg-[var(--accent-soft)] hover:text-[var(--text-primary)]"
        >
          <IconRefresh className="h-3.5 w-3.5" />
          Try again
        </button>
      </div>
    );
  }

  if (loading && !data) return <Skeleton />;
  if (!data) return null;

  if (data.totalRequests === 0) {
    return (
      <EmptyState
        art={<ArtTray />}
        title="No leave mail to measure yet"
        hint="Once greytHR leave applications land in your inbox, patterns show up here."
      />
    );
  }

  return <MonthScopedStats data={data} loading={loading} />;
}
