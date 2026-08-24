export type Tone = "amber" | "emerald" | "rose" | "neutral" | "muted";

const TONES: Record<Tone, { value: string; lamp: string }> = {
  amber: { value: "text-[var(--c-amber)]", lamp: "lamp-amber" },
  emerald: { value: "text-[var(--c-emerald)]", lamp: "lamp-green" },
  rose: { value: "text-[var(--c-rose)]", lamp: "lamp-red" },
  neutral: { value: "text-[var(--text-secondary)]", lamp: "" },
  muted: { value: "text-[var(--text-muted)]", lamp: "lamp-hollow" },
};

export interface StatItem {
  label: string;
  value: number;
  tone: Tone;
}

export function StatStrip({
  items,
  loading,
}: {
  items: StatItem[];
  loading?: boolean;
}) {
  return (
    <div className="overflow-hidden">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-4 sm:-ml-10 sm:flex sm:flex-wrap sm:items-stretch sm:gap-0">
        {items.map((item) => {
          const t = TONES[item.tone];
          return (
            <div
              key={item.label}
              className="min-w-0 sm:flex-none sm:border-l sm:border-[var(--border)] sm:px-10"
            >
              {loading ? (
                <div className="skeleton h-8 w-10 rounded" />
              ) : (
                <dd
                  className={`font-mono text-[22px] font-medium leading-none tracking-tight tabular-nums sm:text-[32px] ${t.value}`}
                >
                  {item.value}
                </dd>
              )}
              <dt className="mt-2 flex items-center gap-1.5 whitespace-nowrap text-[10px] font-medium uppercase tracking-[0.16em] text-[var(--text-muted)]">
                <span className={`lamp-dot h-[5px] w-[5px] shrink-0 ${t.lamp}`} />
                {item.label}
              </dt>
            </div>
          );
        })}
      </dl>
    </div>
  );
}
