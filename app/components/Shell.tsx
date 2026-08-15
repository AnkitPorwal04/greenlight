"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  IconGithub,
  IconGrid,
  IconHistory,
  IconLock,
  IconLogout,
  IconRefresh,
  IconSearch,
  IconUsers,
  IconX,
  Logo,
} from "./icons";
import { ThemeToggleIcon } from "./ThemeToggle";
import type { AuthState, View } from "./utils";

interface NavbarProps {
  view: View;
  onView: (v: View) => void;
  onDirectory: () => void;
  pendingCount: number;
  historyCount: number;
  auth: AuthState | null;
  loading: boolean;
  onSync: () => void;
  query: string;
  onQuery: (q: string) => void;
  onDisconnect: () => void;
  onLock: () => void;
  onHome: () => void;
}

function Badge({ count, active }: { count: number; active?: boolean }) {
  if (count <= 0) return null;
  return (
    <span
      className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${
        active
          ? "bg-[var(--accent-soft)] text-[var(--accent)]"
          : "bg-[var(--surface-raised)] text-[var(--text-muted)]"
      }`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

function Tab({
  active,
  icon,
  label,
  badge,
  disabled,
  onClick,
}: {
  active?: boolean;
  icon: ReactNode;
  label: string;
  badge?: number;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-current={active ? "page" : undefined}
      className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40 md:py-1.5 ${
        active
          ? "bg-[var(--surface-raised)] text-[var(--text-primary)]"
          : "text-[var(--text-secondary)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)]"
      }`}
    >
      <span
        className={active ? "text-[var(--accent)]" : "text-[var(--text-muted)]"}
      >
        {icon}
      </span>
      {label}
      <Badge count={badge ?? 0} active={active} />
    </button>
  );
}

function SearchField({
  query,
  onQuery,
  autoFocus,
  className,
}: {
  query: string;
  onQuery: (q: string) => void;
  autoFocus?: boolean;
  className?: string;
}) {
  return (
    <div className={`relative ${className ?? ""}`}>
      <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
      <input
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        autoFocus={autoFocus}
        placeholder="Search name or code"
        aria-label="Search requests"
        className="field w-full rounded-lg py-2.5 pl-9 pr-11 text-sm transition md:py-1.5 md:pr-10"
      />
      {query && (
        <button
          onClick={() => onQuery("")}
          aria-label="Clear search"
          className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded text-[var(--text-muted)] transition hover:text-[var(--text-primary)] md:h-8 md:w-8"
        >
          <IconX className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

function AccountMenu({
  auth,
  onDirectory,
  onDisconnect,
  onLock,
}: {
  auth: AuthState | null;
  onDirectory: () => void;
  onDisconnect: () => void;
  onLock: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const connected = auth?.connected === true;
  const email = auth?.email ?? "";
  const initial = email.trim().charAt(0).toUpperCase() || "?";

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={() => setOpen(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        title={connected ? email : "Not connected"}
        className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border text-sm font-semibold transition md:h-9 md:w-9 ${
          open
            ? "border-[var(--accent-ring)] bg-[var(--accent-soft)] text-[var(--accent)]"
            : "border-[var(--border)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
        }`}
      >
        {initial}
        <span
          className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--surface)] ${
            connected ? "bg-emerald-500" : "bg-[var(--text-muted)]"
          }`}
        />
      </button>

      {open && (
        <div
          role="menu"
          className="menu-pop rise-in absolute right-0 top-12 z-50 w-64 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl md:top-11"
        >
          <div className="border-b border-[var(--border)] px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              {connected ? "Connected account" : "Account"}
            </p>
            <div className="mt-1.5 flex min-w-0 items-center gap-2">
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                  connected ? "bg-emerald-500" : "bg-[var(--text-muted)]"
                }`}
              />
              <span
                title={email}
                className="min-w-0 truncate text-sm text-[var(--text-primary)]"
              >
                {connected ? email || "Gmail" : "No Gmail connected"}
              </span>
            </div>
          </div>

          <div className="p-1.5">
            {connected && (
              <>
                <button
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    onDirectory();
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-[var(--text-secondary)] transition hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)]"
                >
                  <IconUsers className="h-4 w-4 text-[var(--text-muted)]" />
                  Employee directory
                </button>
                <div className="my-1 h-px bg-[var(--border)]" />
              </>
            )}
            {connected ? (
              <button
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onDisconnect();
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-[var(--text-secondary)] transition hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)]"
              >
                <IconLogout className="h-4 w-4 text-[var(--text-muted)]" />
                Disconnect Gmail
              </button>
            ) : (
              <a
                role="menuitem"
                href="/api/auth/login"
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-[var(--text-secondary)] transition hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)]"
              >
                <IconLogout className="h-4 w-4 text-[var(--text-muted)]" />
                Connect Gmail
              </a>
            )}
            <button
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onLock();
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-[var(--text-secondary)] transition hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)]"
            >
              <IconLock className="h-4 w-4 text-[var(--text-muted)]" />
              Lock app
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function Navbar({
  view,
  onView,
  onDirectory,
  pendingCount,
  historyCount,
  auth,
  loading,
  onSync,
  query,
  onQuery,
  onDisconnect,
  onLock,
  onHome,
}: NavbarProps) {
  const [mobileSearch, setMobileSearch] = useState(false);
  const connected = auth?.connected === true;

  return (
    <header className="navbar sticky top-0 z-40">
      <div className="mx-auto flex h-[var(--nav-bar-h)] max-w-6xl items-center gap-3 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-2.5">
          <button
            onClick={onHome}
            aria-label="Greenlight home — refresh"
            title="Refresh"
            className="flex min-w-0 items-center gap-2.5 rounded-lg transition hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
          >
            <span className="shrink-0">
              <Logo size={28} idSuffix="nav" />
            </span>
            <span className="truncate text-[15px] font-semibold tracking-tight text-[var(--text-primary)]">
              Greenlight
            </span>
          </button>
          <span className="hidden shrink-0 rounded border border-[var(--border)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-muted)] sm:inline">
            beta
          </span>
        </div>

        <nav
          aria-label="Primary"
          className="ml-4 hidden shrink-0 items-center gap-1 md:flex"
        >
          <Tab
            active={view === "dashboard"}
            icon={<IconGrid />}
            label="Dashboard"
            badge={pendingCount}
            disabled={!connected}
            onClick={() => onView("dashboard")}
          />
          <Tab
            active={view === "history"}
            icon={<IconHistory />}
            label="History"
            badge={historyCount}
            disabled={!connected}
            onClick={() => onView("history")}
          />
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          {connected && (
            <SearchField
              query={query}
              onQuery={onQuery}
              className="hidden w-56 md:block lg:w-72"
            />
          )}
          {connected && (
            <button
              onClick={() => setMobileSearch(!mobileSearch)}
              aria-label={mobileSearch ? "Close search" : "Search"}
              aria-expanded={mobileSearch}
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--text-secondary)] transition hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] md:hidden"
            >
              {mobileSearch ? (
                <IconX className="h-4 w-4" />
              ) : (
                <IconSearch className="h-4 w-4" />
              )}
            </button>
          )}
          {connected ? (
            <button
              onClick={onSync}
              disabled={loading}
              aria-label="Sync inbox"
              title="Sync inbox"
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--text-secondary)] transition hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] disabled:opacity-50 md:h-9 md:w-9"
            >
              <IconRefresh
                className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
              />
            </button>
          ) : (
            <a
              href="/api/auth/login"
              className="accent hidden shrink-0 items-center rounded-lg px-3 py-2.5 text-xs font-semibold text-white transition hover:brightness-110 sm:inline-flex md:py-1.5"
            >
              Connect Gmail
            </a>
          )}
          <ThemeToggleIcon />
          <AccountMenu
            auth={auth}
            onDirectory={onDirectory}
            onDisconnect={onDisconnect}
            onLock={onLock}
          />
        </div>
      </div>

      <div className="border-t border-[var(--border)] md:hidden">
        <div className="mx-auto flex h-[var(--nav-tabs-h)] max-w-6xl items-center gap-1 overflow-x-auto px-4">
          {mobileSearch && connected ? (
            <SearchField
              query={query}
              onQuery={onQuery}
              autoFocus
              className="w-full"
            />
          ) : (
            <>
              <Tab
                active={view === "dashboard"}
                icon={<IconGrid />}
                label="Dashboard"
                badge={pendingCount}
                disabled={!connected}
                onClick={() => onView("dashboard")}
              />
              <Tab
                active={view === "history"}
                icon={<IconHistory />}
                label="History"
                badge={historyCount}
                disabled={!connected}
                onClick={() => onView("history")}
              />
            </>
          )}
        </div>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="footer-bar mt-12">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-6 text-xs text-[var(--text-muted)] sm:flex-row sm:px-6">
        <p className="text-center">
          Greenlight — one-click leave approvals · ©{" "}
          {new Date().getFullYear()}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
          <a
            href="https://github.com/AnkitPorwal04/greenlight"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 transition hover:text-[var(--text-primary)]"
          >
            <IconGithub className="h-3.5 w-3.5" />
            GitHub
          </a>
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Powered by Gmail API
          </span>
        </div>
      </div>
    </footer>
  );
}
