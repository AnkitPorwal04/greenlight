export type Tone = "amber" | "emerald" | "rose" | "neutral";

const TONES: Record<Tone, { value: string; lamp: string }> = {
  amber: { value: "text-[var(--c-amber)]", lamp: "lamp-amber" },
  emerald: { value: "text-[var(--c-emerald)]", lamp: "lamp-green" },
  rose: { value: "text-[var(--c-rose)]", lamp: "lamp-red" },
  neutral: { value: "text-[var(--text-secondary)]", lamp: "" },
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
      <dl className="-ml-6 flex flex-wrap items-stretch gap-y-6 sm:-ml-10">
        {items.map((item) => {
          const t = TONES[item.tone];
          return (
            <div
              key={item.label}
              className="min-w-[5.5rem] flex-1 border-l border-[var(--border)] px-6 sm:min-w-0 sm:flex-none sm:px-10"
            >
              {loading ? (
                <div className="skeleton h-8 w-10 rounded" />
              ) : (
                <dd
                  className={`font-mono text-[28px] font-medium leading-none tracking-tight tabular-nums sm:text-[32px] ${t.value}`}
                >
                  {item.value}
                </dd>
              )}
              <dt className="mt-2 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.16em] text-[var(--text-muted)]">
                <span className={`lamp-dot h-[5px] w-[5px] ${t.lamp}`} />
                {item.label}
              </dt>
            </div>
          );
        })}
      </dl>
    </div>
  );
}
