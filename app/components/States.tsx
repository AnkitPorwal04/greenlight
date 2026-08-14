import type { ReactNode } from "react";
import { IconArrowRight, IconCheckCircle, Logo } from "./icons";

export function ConnectHero() {
  return (
    <div className="rise-in panel mx-auto mt-10 max-w-lg rounded-2xl p-8 text-center">
      <div className="mx-auto flex w-fit">
        <Logo size={48} idSuffix="hero" />
      </div>
      <h2 className="mt-5 text-lg font-semibold text-[var(--text-primary)]">
        Connect your inbox
      </h2>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-[var(--text-secondary)]">
        Greenlight scans your Gmail for greythr leave applications and lets you
        approve or reject them in one click — the reply mail is written and sent
        for you.
      </p>
      <a
        href="/api/auth/login"
        className="accent mt-6 inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
      >
        Connect Gmail
        <IconArrowRight className="h-4 w-4" />
      </a>
      <p className="mt-4 text-[11px] text-[var(--text-muted)]">
        Requires read + send scopes. Tokens stay on your machine.
      </p>
    </div>
  );
}

export function EmptyState({
  emoji,
  title,
  hint,
}: {
  emoji: string;
  title: string;
  hint?: ReactNode;
}) {
  return (
    <div className="panel rise-in flex flex-col items-center rounded-xl px-6 py-14 text-center">
      <span className="text-3xl">{emoji}</span>
      <p className="mt-4 text-sm font-medium text-[var(--text-primary)]">
        {title}
      </p>
      {hint && (
        <p className="mt-1.5 text-xs text-[var(--text-muted)]">{hint}</p>
      )}
    </div>
  );
}

export function InboxZero({ count }: { count: number }) {
  return (
    <div className="panel rise-in flex flex-col items-center rounded-xl px-6 py-14 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-500/10 text-[var(--c-emerald)]">
        <IconCheckCircle className="h-6 w-6" />
      </span>
      <p className="mt-4 text-sm font-medium text-[var(--text-primary)]">
        You&apos;re all caught up
      </p>
      <p className="mt-1.5 text-xs text-[var(--text-muted)]">
        {count > 0
          ? `${count} request${count === 1 ? "" : "s"} already actioned. Nothing pending.`
          : "No pending leave requests right now."}
      </p>
    </div>
  );
}

export function SkeletonList() {
  return (
    <div className="space-y-6">
      {[0, 1].map((group) => (
        <div key={group}>
          <div className="skeleton h-3 w-24 rounded" />
          <div className="panel mt-3 divide-y divide-[var(--border)] rounded-xl">
            {[0, 1, 2].map((row) => (
              <div key={row} className="flex items-center gap-4 px-5 py-4">
                <div className="skeleton h-9 w-9 shrink-0 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <div className="skeleton h-3 w-40 rounded" />
                  <div className="skeleton h-2.5 w-60 rounded" />
                </div>
                <div className="skeleton h-7 w-20 rounded-lg" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function Toast({ message }: { message: string }) {
  return (
    <div
      role="status"
      className="rise-in panel fixed bottom-5 left-1/2 z-50 max-w-[92vw] -translate-x-1/2 rounded-lg px-4 py-2.5 text-sm text-[var(--text-primary)] shadow-xl shadow-[var(--shadow)]"
    >
      {message}
    </div>
  );
}
