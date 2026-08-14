import type { ReactNode } from "react";

export type Tone = "amber" | "emerald" | "rose" | "indigo";

const TONES: Record<Tone, { icon: string; value: string }> = {
  amber: {
    icon: "bg-amber-500/10 text-[var(--c-amber)]",
    value: "text-[var(--c-amber)]",
  },
  emerald: {
    icon: "bg-emerald-500/10 text-[var(--c-emerald)]",
    value: "text-[var(--c-emerald)]",
  },
  rose: {
    icon: "bg-rose-500/10 text-[var(--c-rose)]",
    value: "text-[var(--c-rose)]",
  },
  indigo: {
    icon: "bg-indigo-500/10 text-[var(--c-indigo)]",
    value: "text-[var(--c-indigo)]",
  },
};

export function StatTile({
  label,
  value,
  tone,
  icon,
  loading,
}: {
  label: string;
  value: number;
  tone: Tone;
  icon: ReactNode;
  loading?: boolean;
}) {
  const t = TONES[tone];
  return (
    <div className="panel flex items-center gap-3 rounded-xl px-4 py-3.5">
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${t.icon}`}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="truncate text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
          {label}
        </p>
        {loading ? (
          <div className="skeleton mt-1.5 h-5 w-8 rounded" />
        ) : (
          <p
            className={`text-xl font-semibold leading-tight tabular-nums ${t.value}`}
          >
            {value}
          </p>
        )}
      </div>
    </div>
  );
}
