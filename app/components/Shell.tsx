import type { ReactNode } from "react";
import {
  IconGrid,
  IconHistory,
  IconRefresh,
  IconUsers,
  Logo,
} from "./icons";
import { ThemeToggle, ThemeToggleIcon } from "./ThemeToggle";
import type { AuthState, View } from "./utils";

interface NavProps {
  view: View;
  onView: (v: View) => void;
  onDirectory: () => void;
  pendingCount: number;
  historyCount: number;
}

interface ShellProps extends NavProps {
  auth: AuthState | null;
  loading: boolean;
  onSync: () => void;
}

function NavItem({
  active,
  icon,
  label,
  badge,
  onClick,
}: {
  active?: boolean;
  icon: ReactNode;
  label: string;
  badge?: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition ${
        active
          ? "bg-[var(--surface-raised)] text-[var(--text-primary)]"
          : "text-[var(--text-secondary)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)]"
      }`}
    >
      <span
        className={
          active ? "text-[var(--accent)]" : "text-[var(--text-muted)]"
        }
      >
        {icon}
      </span>
      <span className="flex-1 text-left">{label}</span>
      {badge !== undefined && badge > 0 && (
        <span
          className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${
            active
              ? "bg-[var(--accent-soft)] text-[var(--accent)]"
              : "bg-[var(--surface-raised)] text-[var(--text-muted)]"
          }`}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

function Wordmark({
  compact,
  idSuffix,
}: {
  compact?: boolean;
  idSuffix: string;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <Logo size={28} idSuffix={idSuffix} />
      <span className="text-[15px] font-semibold tracking-tight text-[var(--text-primary)]">
        Greenlight
      </span>
      {!compact && (
        <span className="rounded border border-[var(--border)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-muted)]">
          beta
        </span>
      )}
    </div>
  );
}

export function Sidebar({
  view,
  onView,
  onDirectory,
  pendingCount,
  historyCount,
  auth,
  loading,
  onSync,
}: ShellProps) {
  return (
    <aside className="rail fixed inset-y-0 left-0 z-30 hidden w-60 flex-col lg:flex">
      <div className="flex h-14 shrink-0 items-center border-b border-[var(--border)] px-4">
        <Wordmark idSuffix="sidebar" />
      </div>

      <nav className="flex-1 space-y-1 p-3">
        <p className="px-3 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          Workspace
        </p>
        <NavItem
          active={view === "dashboard"}
          icon={<IconGrid />}
          label="Dashboard"
          badge={pendingCount}
          onClick={() => onView("dashboard")}
        />
        <NavItem
          active={view === "history"}
          icon={<IconHistory />}
          label="History"
          badge={historyCount}
          onClick={() => onView("history")}
        />
        <NavItem
          icon={<IconUsers />}
          label="Directory"
          onClick={onDirectory}
        />
      </nav>

      <div className="space-y-3 border-t border-[var(--border)] p-3">
        {auth?.connected ? (
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Connected account
            </p>
            <div className="mt-2 flex items-center gap-2">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
              <span
                title={auth.email}
                className="truncate text-xs text-[var(--text-secondary)]"
              >
                {auth.email ?? "Gmail"}
              </span>
            </div>
            <button
              onClick={onSync}
              disabled={loading}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-xs font-medium text-[var(--text-primary)] transition hover:border-[var(--border-strong)] disabled:opacity-50"
            >
              <IconRefresh
                className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
              />
              {loading ? "Syncing" : "Sync inbox"}
            </button>
          </div>
        ) : (
          <a
            href="/api/auth/login"
            className="accent flex w-full items-center justify-center rounded-lg px-3 py-2 text-xs font-semibold text-white transition hover:brightness-110"
          >
            Connect Gmail
          </a>
        )}
        <ThemeToggle />
      </div>
    </aside>
  );
}

export function MobileTopBar({
  auth,
  loading,
  onSync,
}: {
  auth: AuthState | null;
  loading: boolean;
  onSync: () => void;
}) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-[var(--border)] bg-[var(--rail)] px-4 lg:hidden">
      <Wordmark compact idSuffix="mobile" />
      <div className="flex items-center gap-2">
        {auth?.connected ? (
          <>
            <span
              title={auth.email}
              className="hidden items-center gap-1.5 rounded-md border border-[var(--border)] px-2 py-1 text-[11px] text-[var(--text-secondary)] sm:flex"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              <span className="max-w-32 truncate">{auth.email}</span>
            </span>
            <button
              onClick={onSync}
              disabled={loading}
              aria-label="Sync inbox"
              className="rounded-lg border border-[var(--border)] p-2 text-[var(--text-secondary)] transition hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] disabled:opacity-50"
            >
              <IconRefresh
                className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
              />
            </button>
          </>
        ) : (
          <a
            href="/api/auth/login"
            className="accent rounded-lg px-3 py-1.5 text-xs font-semibold text-white"
          >
            Connect Gmail
          </a>
        )}
        <ThemeToggleIcon />
      </div>
    </header>
  );
}

export function MobileNav({
  view,
  onView,
  onDirectory,
  pendingCount,
  historyCount,
}: NavProps) {
  const tabs: { key: View; label: string; count: number }[] = [
    { key: "dashboard", label: "Dashboard", count: pendingCount },
    { key: "history", label: "History", count: historyCount },
  ];
  return (
    <div className="mb-6 flex items-center gap-1.5 lg:hidden">
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onView(t.key)}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
            view === t.key
              ? "bg-[var(--surface-raised)] text-[var(--text-primary)]"
              : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          }`}
        >
          {t.label}
          {t.count > 0 && (
            <span className="rounded bg-[var(--surface)] px-1.5 text-[11px] tabular-nums text-[var(--text-secondary)]">
              {t.count}
            </span>
          )}
        </button>
      ))}
      <button
        onClick={onDirectory}
        className="ml-auto flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm font-medium text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
      >
        <IconUsers className="h-4 w-4" />
        Directory
      </button>
    </div>
  );
}
