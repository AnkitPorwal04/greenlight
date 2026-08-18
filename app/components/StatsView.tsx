"use client";

import { useMemo } from "react";
import type { StatsEmployee, StatsPayload } from "@/lib/stats";
import { ArtTray, EmptyState } from "./States";
import { IconAlert, IconRefresh } from "./icons";
import { avatarTone, initials, leaveTypeColor, leaveTypeShort } from "./utils";

const OTHER = "Other";
const OTHER_COLOR = "var(--border-strong)";
const MAX_MONTHS = 12;
const TOP_TYPES = 4;
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

function formatDay(iso: string) {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatNumber(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function shortMonth(label: string) {
  const [name, year] = label.split(" ");
  return year ? `${name} ${year.slice(-2)}` : name;
}

function breakdown(byType: Record<string, number>) {
  return Object.entries(byType)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([type, count]) => `${count} ${leaveTypeShort(type)}`)
    .join(" · ");
}

const OUTCOMES: {
  key: keyof StatsEmployee["outcomes"];
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

function OutcomeChips({ person }: { person: StatsEmployee }) {
  const shown = OUTCOMES.filter((o) => person.outcomes[o.key] > 0);
  if (shown.length === 0) return null;

  return (
    <ul className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
      {shown.map((o) => (
        <li
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
        </li>
      ))}
    </ul>
  );
}

function Skeleton() {
  return (
    <div className="mt-10 space-y-12">
      <div className="space-y-4">
        <div className="skeleton h-3 w-32 rounded" />
        <div className="space-y-2.5">
          {[64, 96, 48, 88, 72, 40].map((w, i) => (
            <div key={i} className="flex items-center gap-3 sm:gap-4">
              <div className="skeleton h-2.5 w-14 shrink-0 rounded" />
              <div
                className="skeleton h-[10px] rounded-[3px]"
                style={{ width: `${w}%` }}
              />
            </div>
          ))}
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

function MonthlyPattern({ data }: { data: StatsPayload }) {
  const { months, series, max } = useMemo(() => {
    const top = data.byType.slice(0, TOP_TYPES).map((t) => t.type);
    const visible = data.byMonth.slice(-MAX_MONTHS);
    const hasOther = data.byType.length > top.length;
    const stack = hasOther ? [...top, OTHER] : top;
    const rows = visible.map((m) => {
      const counts = stack.map((type) => {
        if (type !== OTHER) return m.byType[type] ?? 0;
        return Object.entries(m.byType).reduce(
          (sum, [t, n]) => (top.includes(t) ? sum : sum + n),
          0
        );
      });
      return { month: m.month, total: m.total, counts };
    });
    return {
      months: rows,
      series: stack,
      max: rows.reduce((peak, r) => Math.max(peak, r.total), 0),
    };
  }, [data]);

  const colorOf = (type: string, index: number) =>
    type === OTHER ? OTHER_COLOR : leaveTypeColor(type, index);

  if (months.length === 0) return null;

  return (
    <section className="mt-12">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <Label>Monthly pattern</Label>
        <span className="font-mono text-[11px] tabular-nums text-[var(--text-muted)]">
          last {months.length} {months.length === 1 ? "month" : "months"}
        </span>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2">
        {series.map((type, i) => (
          <span
            key={type}
            className="flex items-center gap-1.5 text-[11px] text-[var(--text-secondary)]"
          >
            <Swatch color={colorOf(type, i)} />
            {type}
          </span>
        ))}
      </div>

      <div className="mt-6 space-y-2.5 border-y border-[var(--border)] py-6">
        {months.map((m) => (
          <div
            key={m.month}
            className="flex items-center gap-3 sm:gap-4"
            title={`${m.month} — ${m.total} ${
              m.total === 1 ? "request" : "requests"
            }`}
          >
            <span className="w-14 shrink-0 font-mono text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
              {shortMonth(m.month)}
            </span>
            <div className="h-[10px] min-w-0 flex-1 overflow-hidden rounded-[3px] bg-[var(--surface-raised)]">
              <div
                className="flex h-full overflow-hidden rounded-[3px] transition-[width] duration-500 ease-out"
                style={{ width: max > 0 ? `${(m.total / max) * 100}%` : "0%" }}
              >
                {m.counts.map((count, i) =>
                  count > 0 ? (
                    <div
                      key={series[i]}
                      title={`${series[i]} — ${count}`}
                      style={{
                        width: `${(count / m.total) * 100}%`,
                        background: colorOf(series[i], i),
                        minWidth: 2,
                      }}
                    />
                  ) : null
                )}
              </div>
            </div>
            <span className="w-7 shrink-0 text-right font-mono text-[11px] tabular-nums text-[var(--text-secondary)]">
              {m.total}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function TopTakers({ data }: { data: StatsPayload }) {
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
        {people.map((person, i) => (
          <li key={`${person.code}-${person.name}`}>
            <div className="flex items-center gap-3 py-4 sm:gap-4">
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
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                  <h3 className="min-w-0 max-w-full truncate text-[14px] font-semibold tracking-tight text-[var(--text-primary)]">
                    {person.name}
                  </h3>
                  <span className="min-w-0 truncate font-mono text-[11px] uppercase tracking-wide text-[var(--text-muted)]">
                    {person.code}
                  </span>
                </div>
                <div className="mt-2 h-[3px] w-full max-w-md overflow-hidden rounded-full bg-[var(--surface-raised)]">
                  <div
                    className="h-full rounded-full bg-[var(--accent)]"
                    style={{
                      width: max > 0 ? `${(person.days / max) * 100}%` : "0%",
                    }}
                  />
                </div>
                <p className="mt-2 font-mono text-[11px] text-[var(--text-muted)]">
                  {breakdown(person.byType) ||
                    `${person.requests} ${
                      person.requests === 1 ? "request" : "requests"
                    }`}
                </p>
                <OutcomeChips person={person} />
              </div>
              <div className="shrink-0 text-right">
                <p className="font-mono text-[24px] font-medium leading-none tracking-tight tabular-nums text-[var(--text-primary)] sm:text-[28px]">
                  {formatNumber(person.days)}
                </p>
                <p className="mt-2 text-[10px] font-medium uppercase tracking-[0.16em] text-[var(--text-muted)]">
                  days
                </p>
              </div>
            </div>
          </li>
        ))}
      </ol>
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

  return (
    <div className={loading ? "opacity-60 transition-opacity" : ""}>
      <section
        aria-label="Overview"
        className="mt-8 border-y border-[var(--border)] py-5"
      >
        <dl className="grid grid-cols-2 gap-x-4 gap-y-6 sm:-ml-10 sm:flex sm:flex-wrap sm:items-stretch sm:gap-0">
          {[
            { label: "Applied", value: String(data.outcomes.applied) },
            { label: "People", value: String(data.byEmployee.length) },
            { label: "Leave types", value: String(data.byType.length) },
            { label: "Since", value: formatDay(data.sinceDate) },
          ].map((item) => (
            <div
              key={item.label}
              className="min-w-0 sm:flex-none sm:border-l sm:border-[var(--border)] sm:px-10"
            >
              <dd className="font-mono text-[22px] font-medium leading-none tracking-tight tabular-nums text-[var(--text-primary)] sm:text-[28px]">
                {item.value}
              </dd>
              <dt className="mt-2 whitespace-nowrap text-[10px] font-medium uppercase tracking-[0.16em] text-[var(--text-muted)]">
                {item.label}
              </dt>
            </div>
          ))}
        </dl>
      </section>

      <MonthlyPattern data={data} />
      <TopTakers data={data} />
      <ByType data={data} />
    </div>
  );
}
