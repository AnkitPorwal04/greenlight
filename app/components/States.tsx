import type { ReactNode } from "react";
import { IconArrowRight, Logo } from "./icons";
import type { ToastState } from "./utils";

export function ArtTray({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 96 72"
      fill="none"
      className={className ?? "h-16 w-24"}
      aria-hidden="true"
    >
      <path
        d="M14 30h18l5 9h22l5-9h18"
        stroke="var(--border-strong)"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M20 16h56l6 14v20a6 6 0 01-6 6H20a6 6 0 01-6-6V30z"
        stroke="var(--border-strong)"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M32 8h32"
        stroke="var(--border)"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ArtSearch({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 96 72"
      fill="none"
      className={className ?? "h-16 w-24"}
      aria-hidden="true"
    >
      <circle
        cx="43"
        cy="32"
        r="17"
        stroke="var(--border-strong)"
        strokeWidth="1.6"
      />
      <path
        d="M56 45l12 12"
        stroke="var(--border-strong)"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M34 28h18M34 34h12"
        stroke="var(--border)"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ArtAllClear({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 96 72"
      fill="none"
      className={className ?? "h-20 w-24"}
      aria-hidden="true"
    >
      <rect
        x="35.5"
        y="6.5"
        width="25"
        height="59"
        rx="9"
        stroke="var(--border-strong)"
        strokeWidth="1.6"
      />
      <path
        d="M48 6.5V2M28 20h7M61 20h7M28 36h7M61 36h7M28 52h7M61 52h7"
        stroke="var(--border)"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <circle cx="48" cy="20" r="5.5" fill="var(--lamp-dim-red)" />
      <circle cx="48" cy="36" r="5.5" fill="var(--lamp-dim-amber)" />
      <circle cx="48" cy="52" r="8" fill="var(--signal-green)" opacity="0.25" />
      <circle cx="48" cy="52" r="5.5" fill="var(--signal-green)" />
    </svg>
  );
}

export function ConnectHero() {
  return (
    <div className="rise-in mx-auto mt-14 max-w-xl px-1 text-center">
      <div className="mx-auto flex w-fit">
        <Logo size={44} idSuffix="hero" />
      </div>
      <h2 className="mt-6 text-3xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-4xl">
        Connect your inbox
      </h2>
      <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-[var(--text-secondary)]">
        Greenlight scans your Gmail for greythr leave applications and lets you
        approve or reject them in one click — the reply mail is written and sent
        for you.
      </p>
      <a
        href="/api/auth/login"
        className="accent press mt-8 inline-flex items-center gap-2 rounded-md px-5 py-2.5 text-sm font-semibold"
      >
        Connect Gmail
        <IconArrowRight className="h-4 w-4" />
      </a>
      <p className="mt-5 font-mono text-[11px] text-[var(--text-muted)]">
        Read + send scopes · tokens stay on your machine
      </p>
    </div>
  );
}

export function EmptyState({
  art,
  title,
  hint,
}: {
  art: ReactNode;
  title: string;
  hint?: ReactNode;
}) {
  return (
    <div className="rise-in flex flex-col items-center px-6 py-16 text-center">
      {art}
      <p className="mt-6 text-lg font-semibold tracking-tight text-[var(--text-primary)]">
        {title}
      </p>
      {hint && (
        <p className="mt-2 max-w-sm text-[13px] leading-relaxed text-[var(--text-muted)]">
          {hint}
        </p>
      )}
    </div>
  );
}

export function InboxZero({ count }: { count: number }) {
  return (
    <div className="rise-in flex flex-col items-center px-6 py-16 text-center">
      <ArtAllClear />
      <p className="mt-6 text-lg font-semibold tracking-tight text-[var(--text-primary)]">
        All clear. Nothing waiting on you.
      </p>
      <p className="mt-2 font-mono text-[12px] text-[var(--text-muted)]">
        {count > 0
          ? `${count} request${count === 1 ? "" : "s"} actioned · 0 pending`
          : "0 pending"}
      </p>
    </div>
  );
}

export function SkeletonList() {
  return (
    <div className="space-y-10">
      {[0, 1].map((group) => (
        <div key={group}>
          <div className="flex items-baseline gap-3">
            <div className="skeleton h-7 w-28 rounded" />
            <div className="skeleton h-3 w-20 rounded" />
          </div>
          <div className="mt-4 divide-y divide-[var(--border)] border-y border-[var(--border)]">
            {[0, 1, 2].map((row) => (
              <div key={row} className="flex items-center gap-3 px-1 py-4">
                <div
                  aria-hidden="true"
                  className="lamp-skeleton inline-flex h-[26px] w-[11px] shrink-0 flex-col items-center gap-[3px] rounded-full border border-[var(--border)] px-[3px] py-[4px]"
                >
                  <span className="lamp-dot lamp-dim-amber h-[5px] w-[5px]" />
                  <span className="lamp-dot lamp-dim-red h-[5px] w-[5px]" />
                  <span className="lamp-dot lamp-dim-green h-[5px] w-[5px]" />
                </div>
                <div className="skeleton h-9 w-9 shrink-0 rounded-full" />
                <div className="flex-1 space-y-2">
                  <div className="skeleton h-3.5 w-44 rounded" />
                  <div className="skeleton h-3 w-64 rounded" />
                </div>
                <div className="skeleton hidden h-3.5 w-32 rounded lg:block" />
                <div className="skeleton hidden h-7 w-24 rounded-md sm:block" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function Toast({ message, tone = "success" }: ToastState) {
  return (
    <div
      role="status"
      className="rise-in panel fixed bottom-5 left-1/2 z-50 flex max-w-[92vw] -translate-x-1/2 items-center gap-2.5 rounded-lg px-4 py-2.5 text-[13px] text-[var(--text-primary)] shadow-xl shadow-[var(--shadow)]"
    >
      <span
        aria-hidden="true"
        className={`lamp-dot h-1.5 w-1.5 shrink-0 ${
          tone === "error" ? "lamp-red" : "lamp-green"
        }`}
      />
      {message}
    </div>
  );
}
