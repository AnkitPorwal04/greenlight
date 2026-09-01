"use client";

import { useId, useMemo, useState } from "react";
import {
  aggregateStats,
  buildStatsMonths,
  entriesInMonth,
  statsMonthKey,
  statsMonthLabel,
  statsMonthShortLabel,
  type StatsEmployee,
  type StatsEmployeeEntry,
  type StatsOutcome,
  type StatsPayload,
} from "@/lib/stats";
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

function breakdown(byType: Record<string, number>) {
  return Object.entries(byType)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([type, count]) => `${count} ${leaveTypeShort(type)}`)
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
  {
    key: "withdrawn",
    label: "withdrawn",
    lamp: "lamp-hollow",
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
  const items = [
    { label: "Applied", value: String(data.outcomes.applied), muted: false },
    { label: "People", value: String(data.byEmployee.length), muted: false },
    { label: "Leave types", value: String(data.byType.length), muted: false },
  ];
  if (data.outcomes.withdrawn > 0) {
    items.push({
      label: "Withdrawn",
      value: String(data.outcomes.withdrawn),
      muted: true,
    });
  }
  items.push({ label: "Month", value: monthLabel, muted: false });
  return items;
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
            <dd
              className={`font-mono text-[22px] font-medium leading-none tracking-tight tabular-nums sm:text-[28px] ${
                item.muted
                  ? "text-[var(--text-muted)]"
                  : "text-[var(--text-primary)]"
              }`}
            >
              {item.value}
            </dd>
            <dt className="mt-2 flex items-center gap-1.5 whitespace-nowrap text-[10px] font-medium uppercase tracking-[0.16em] text-[var(--text-muted)]">
              {item.muted && (
                <span
                  aria-hidden="true"
                  className="lamp-dot lamp-hollow h-[5px] w-[5px] shrink-0"
                />
              )}
              {item.label}
            </dt>
          </div>
        ))}
      </dl>
    </section>
  );
}

function OutcomeChips({ person }: { person: StatsEmployee }) {
  const shown = OUTCOMES.filter((o) => person.outcomes[o.key] > 0);
  if (shown.length === 0) return null;

  return (
    <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
      {shown.map((o) => (
        <span
          key={o.key}
          title={`${person.outcomes[o.key]} ${o.label}`}
          className={`flex items-center gap-1.5 text-[11px] ${o.tone}`}
        >
          <span
            aria-hidden="true"
            className={`lamp-dot h-[5px] w-[5px] shrink-0 ${o.lamp}`}
          />
          <span className="font-mono tabular-nums">
            {person.outcomes[o.key]}
          </span>
          <span className="sr-only sm:not-sr-only">{o.label}</span>
        </span>
      ))}
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
  const typeIndex = useMemo(
    () => new Map(data.byType.map((t, i) => [t.type, i] as const)),
    [data]
  );

  const people = data.byEmployee.slice(0, TOP_PEOPLE);
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
                    {breakdown(person.byType) ||
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

  // Withdrawn leaves were never actually taken — keep them out of the headline
  // count and days, matching how the rest of Stats treats them.
  const taken = monthEntries.filter((e) => e.status !== "withdrawn");
  const takenDays = taken.reduce((sum, e) => sum + e.numberOfDays, 0);
  const withdrawnCount = monthEntries.length - taken.length;

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
                  {taken.length}
                </span>
                <span className="text-[12px] text-[var(--text-secondary)]">
                  {taken.length === 1 ? "leave" : "leaves"} taken
                </span>
                <span className="text-[var(--text-muted)]">·</span>
                <span className="font-mono text-[13px] tabular-nums text-[var(--text-secondary)]">
                  {formatNumber(takenDays)} days
                </span>
                {withdrawnCount > 0 && (
                  <span className="ml-auto text-[11px] text-[var(--text-muted)]">
                    {withdrawnCount} withdrawn
                  </span>
                )}
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

function MonthScopedStats({
  data,
  loading,
}: {
  data: StatsPayload;
  loading: boolean;
}) {
  const [picked, setPicked] = useState<string | null>(null);

  const now = useMemo(() => new Date(), []);
  const months = useMemo(
    () => buildStatsMonths(data.entries, now),
    [data, now]
  );

  const currentKey = statsMonthKey(now.toISOString());
  const fallbackKey = months.some((m) => m.key === currentKey)
    ? currentKey
    : (months[0]?.key ?? "");
  const activeKey =
    picked && months.some((m) => m.key === picked) ? picked : fallbackKey;

  const monthData = useMemo(
    () => aggregateStats(entriesInMonth(data.entries, activeKey)),
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
