"use client";

import { useEffect, useRef, useState } from "react";
import {
  IconGithub,
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
  auth: AuthState | null;
  loading: boolean;
  onSync: () => void;
  query: string;
  onQuery: (q: string) => void;
  mobileSearch: boolean;
  onMobileSearch: (open: boolean) => void;
  onDisconnect: () => void;
  onLock: () => void;
  onHome: () => void;
}

function Tab({
  active,
  label,
  count,
  exactCount,
  disabled,
  onClick,
}: {
  active?: boolean;
  label: string;
  count?: number;
  exactCount?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      data-active={active ? "true" : "false"}
      aria-current={active ? "page" : undefined}
      className={`underline-tab press flex h-full shrink-0 items-center gap-1.5 px-1 text-[13px] font-medium disabled:cursor-not-allowed disabled:opacity-40 ${
        active
          ? "text-[var(--text-primary)]"
          : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
      }`}
    >
      {label}
      {count && count > 0 ? (
        <span
          className={`font-mono text-[11px] tabular-nums ${
            active ? "text-[var(--accent)]" : "text-[var(--text-muted)]"
          }`}
        >
          {!exactCount && count > 99 ? "99+" : count}
        </span>
      ) : null}
    </button>
  );
}

export function MonthTabs({
  months,
  active,
  onSelect,
}: {
  months: { key: string; label: string; count: number }[];
  active: string;
  onSelect: (key: string) => void;
}) {
  if (months.length === 0) return null;

  return (
    <nav
      aria-label="History month"
      className="scrollbar-none -mb-px flex h-11 items-center gap-6 overflow-x-auto overflow-y-hidden"
    >
      {months.map((month) => (
        <Tab
          key={month.key}
          active={month.key === active}
          label={month.label}
          count={month.count}
          exactCount
          onClick={() => onSelect(month.key)}
        />
      ))}
    </nav>
  );
}

function SearchField({
  query,
  onQuery,
  autoFocus,
  className,
  inputId,
  placeholder = "Search name or code — press /",
}: {
  query: string;
  onQuery: (q: string) => void;
  autoFocus?: boolean;
  className?: string;
  inputId?: string;
  placeholder?: string;
}) {
  return (
    <div className={`relative ${className ?? ""}`}>
      <IconSearch className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]" />
      <input
        id={inputId}
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        autoFocus={autoFocus}
        placeholder={placeholder}
        aria-label="Search requests by name or employee code"
        className="field w-full rounded-md py-2 pl-8 pr-10 text-[13px] transition md:py-1.5"
      />
      {query ? (
        <button
          onClick={() => onQuery("")}
          aria-label="Clear search"
          className="absolute right-0.5 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded text-[var(--text-muted)] transition hover:text-[var(--text-primary)] md:right-1 md:h-7 md:w-7"
        >
          <IconX className="h-3.5 w-3.5" />
        </button>
      ) : (
        <kbd className="kbd pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2">
          /
        </kbd>
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
        data-tip="That's you!"
        className={`tip tip-end press relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold md:h-9 md:w-9 ${
          open
            ? "bg-[var(--accent-soft)] text-[var(--accent)]"
            : "bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        }`}
      >
        {initial}
        <span
          className={`lamp-dot absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 border-2 border-[var(--bg)] ${
            connected ? "lamp-green" : ""
          }`}
        />
      </button>

      {open && (
        <div
          role="menu"
          className="menu-pop rise-in absolute right-0 top-11 z-50 w-64 max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg"
        >
          <div className="border-b border-[var(--border)] px-4 py-3">
            <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-[var(--text-muted)]">
              {connected ? "Connected account" : "Account"}
            </p>
            <div className="mt-2 flex min-w-0 items-center gap-2">
              <span
                className={`lamp-dot h-1.5 w-1.5 shrink-0 ${
                  connected ? "lamp-green" : ""
                }`}
              />
              <span
                title={email}
                className="min-w-0 truncate font-mono text-[12px] text-[var(--text-primary)]"
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
                  className="press flex min-h-11 w-full items-center gap-2.5 rounded-md px-3 py-2.5 text-[13px] text-[var(--text-secondary)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)]"
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
                className="press flex min-h-11 w-full items-center gap-2.5 rounded-md px-3 py-2.5 text-[13px] text-[var(--text-secondary)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)]"
              >
                <IconLogout className="h-4 w-4 text-[var(--text-muted)]" />
                Disconnect Gmail
              </button>
            ) : (
              <a
                role="menuitem"
                href="/api/auth/login"
                className="press flex min-h-11 w-full items-center gap-2.5 rounded-md px-3 py-2.5 text-[13px] text-[var(--text-secondary)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)]"
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
              className="press flex min-h-11 w-full items-center gap-2.5 rounded-md px-3 py-2.5 text-[13px] text-[var(--text-secondary)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)]"
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
  auth,
  loading,
  onSync,
  query,
  onQuery,
  mobileSearch,
  onMobileSearch,
  onDisconnect,
  onLock,
  onHome,
}: NavbarProps) {
  const connected = auth?.connected === true;

  return (
    <header className="navbar sticky top-0 z-40">
      <div className="flex h-[var(--nav-bar-h)] items-center gap-2 px-4 sm:gap-3 sm:px-6 lg:px-10">
        <div className="flex min-w-0 items-center gap-2">
          <button
            onClick={onHome}
            aria-label="Greenlight home — refresh"
            title="Refresh"
            className="press flex min-w-0 items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
          >
            <span className="shrink-0">
              <Logo size={22} idSuffix="nav" />
            </span>
            <span className="truncate text-[15px] font-semibold tracking-tight text-[var(--text-primary)]">
              Greenlight
            </span>
          </button>
          <span className="hidden shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)] sm:inline">
            beta
          </span>
        </div>

        <nav
          aria-label="Primary"
          className="ml-6 hidden h-full shrink-0 items-center gap-5 md:flex"
        >
          <Tab
            active={view === "dashboard"}
            label="Dashboard"
            count={pendingCount}
            disabled={!connected}
            onClick={() => onView("dashboard")}
          />
          <Tab
            active={view === "history"}
            label="History"
            disabled={!connected}
            onClick={() => onView("history")}
          />
          <Tab
            active={view === "stats"}
            label="Stats"
            disabled={!connected}
            onClick={() => onView("stats")}
          />
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-0.5 sm:gap-2.5">
          {connected && (
            <SearchField
              query={query}
              onQuery={onQuery}
              inputId="gl-search"
              className="hidden w-64 transition-all duration-200 focus-within:w-80 md:block lg:w-80 lg:focus-within:w-96 xl:w-96 xl:focus-within:w-[28rem]"
            />
          )}
          {connected && (
            <button
              onClick={() => onMobileSearch(!mobileSearch)}
              aria-label={mobileSearch ? "Close search" : "Search"}
              aria-expanded={mobileSearch}
              data-tip="Find someone"
              className="tip press flex h-10 w-10 items-center justify-center rounded-md text-[var(--text-secondary)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)] md:hidden"
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
              data-tip="Fetch fresh mail"
              className="tip press flex h-10 w-10 items-center justify-center rounded-md text-[var(--text-secondary)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)] disabled:opacity-50 md:h-9 md:w-9"
            >
              <IconRefresh
                className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
              />
            </button>
          ) : (
            <a
              href="/api/auth/login"
              className="accent press hidden shrink-0 items-center rounded-md px-3 py-2 text-[12px] font-semibold sm:inline-flex md:py-1.5"
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
        <div className="scrollbar-none flex h-[var(--nav-tabs-h)] items-center gap-6 overflow-x-auto overflow-y-hidden px-4">
          {mobileSearch && connected ? (
            <SearchField
              query={query}
              onQuery={onQuery}
              autoFocus
              inputId="gl-search-mobile"
              placeholder="Search name or code"
              className="w-full"
            />
          ) : (
            <>
              <Tab
                active={view === "dashboard"}
                label="Dashboard"
                count={pendingCount}
                disabled={!connected}
                onClick={() => onView("dashboard")}
              />
              <Tab
                active={view === "history"}
                label="History"
                disabled={!connected}
                onClick={() => onView("history")}
              />
              <Tab
                active={view === "stats"}
                label="Stats"
                disabled={!connected}
                onClick={() => onView("stats")}
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
    <footer className="footer-bar mt-16">
      <div className="flex flex-col items-center justify-between gap-3 px-4 py-6 lg:px-10 font-mono text-[11px] text-[var(--text-muted)] sm:flex-row sm:px-6">
        <p className="text-center">
          Greenlight · one-click leave approvals · ©{" "}
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
            <span className="lamp-dot lamp-green h-1.5 w-1.5" />
            Powered by Gmail API
          </span>
        </div>
      </div>
    </footer>
  );
}
