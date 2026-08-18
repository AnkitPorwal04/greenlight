"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ConfirmModal } from "./components/ConfirmModal";
import { DecisionModal } from "./components/DecisionModal";
import { DirectoryModal } from "./components/DirectoryModal";
import { EmailModal } from "./components/EmailModal";
import { RequestRow } from "./components/RequestRow";
import { Footer, MonthTabs, Navbar } from "./components/Shell";
import { StatStrip } from "./components/StatTile";
import { StatsView } from "./components/StatsView";
import {
  ArtSearch,
  ArtTray,
  ConnectHero,
  EmptyState,
  InboxZero,
  SkeletonList,
  Toast,
} from "./components/States";
import { IconAlert, IconRefresh } from "./components/icons";
import {
  groupByDate,
  matchesQuery,
  type Action,
  type AuthState,
  type ModalState,
  type ToastState,
  type View,
} from "./components/utils";
import { composeDecisionMail } from "@/lib/compose";
import { buildHistoryMonths } from "@/lib/history";
import type { StatsPayload } from "@/lib/stats";
import type { LeaveRequest } from "@/lib/types";

const PAGE_COPY: Record<View, { title: string; subtitle: string }> = {
  dashboard: {
    title: "Dashboard",
    subtitle: "Leave requests waiting on your decision, newest first.",
  },
  history: {
    title: "History",
    subtitle: "Every request you have already actioned, month by month.",
  },
  stats: {
    title: "Stats",
    subtitle: "Leave patterns across your team.",
  },
};

const EXIT_MS = 250;
const PULSE_MS = 220;
const NO_REQUESTS: LeaveRequest[] = [];

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default function Home() {
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [emailModal, setEmailModal] = useState<LeaveRequest | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [view, setView] = useState<View>("dashboard");
  const [showDirectory, setShowDirectory] = useState(false);
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [capped, setCapped] = useState(false);
  const [query, setQuery] = useState("");
  const [exiting, setExiting] = useState<string[]>([]);
  const [pulse, setPulse] = useState<{ id: string; action: Action } | null>(
    null
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busyIds, setBusyIds] = useState<string[]>([]);
  const [mobileSearch, setMobileSearch] = useState(false);
  const [statsData, setStatsData] = useState<StatsPayload | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [historyRequests, setHistoryRequests] = useState<LeaveRequest[] | null>(
    null
  );
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyCapped, setHistoryCapped] = useState(false);
  const [monthKey, setMonthKey] = useState<string | null>(null);
  const loadIdRef = useRef(0);
  const statsLoadIdRef = useRef(0);
  const historyLoadIdRef = useRef(0);
  const historyLoadedRef = useRef(false);
  const keyboardNavRef = useRef(false);

  const loadStats = useCallback(async () => {
    const loadId = statsLoadIdRef.current + 1;
    statsLoadIdRef.current = loadId;
    setStatsLoading(true);
    setStatsError(null);
    try {
      const res = await fetch("/api/stats");
      const data = await res.json();
      if (loadId !== statsLoadIdRef.current) return;
      if (!res.ok) {
        setStatsError(
          data.error === "not_connected"
            ? "Gmail is not connected"
            : (data.error ?? "Could not load stats")
        );
        return;
      }
      setStatsData(data as StatsPayload);
    } catch {
      if (loadId === statsLoadIdRef.current) {
        setStatsError("Could not reach the server");
      }
    } finally {
      if (loadId === statsLoadIdRef.current) setStatsLoading(false);
    }
  }, []);

  const loadRequests = useCallback(async (opts?: { skeleton?: boolean }) => {
    const loadId = loadIdRef.current + 1;
    loadIdRef.current = loadId;
    setLoading(true);
    if (opts?.skeleton) setRefreshing(true);
    setFetchError(null);
    const minVisible = opts?.skeleton ? wait(450) : null;
    try {
      const res = await fetch("/api/leaves");
      const data = await res.json();
      if (loadId !== loadIdRef.current) return;
      if (!res.ok) {
        if (data.error !== "not_connected") setFetchError(data.error);
        setRequests([]);
        setCapped(false);
        return;
      }
      setRequests(data.requests);
      setCapped(Boolean(data.capped));
    } catch {
      if (loadId === loadIdRef.current) {
        setFetchError("Could not reach the server");
        setCapped(false);
      }
    } finally {
      if (minVisible) await minVisible;
      if (loadId === loadIdRef.current) {
        setLoading(false);
        setRefreshing(false);
        setExiting([]);
        setPulse(null);
      }
    }
  }, []);

  const loadHistory = useCallback(async () => {
    const loadId = historyLoadIdRef.current + 1;
    historyLoadIdRef.current = loadId;
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const res = await fetch("/api/history");
      const data = await res.json();
      if (loadId !== historyLoadIdRef.current) return;
      if (!res.ok) {
        setHistoryError(
          data.error === "not_connected"
            ? "Gmail is not connected"
            : (data.error ?? "Could not load history")
        );
        return;
      }
      historyLoadedRef.current = true;
      setHistoryRequests(data.requests as LeaveRequest[]);
      setHistoryCapped(Boolean(data.capped));
    } catch {
      if (loadId === historyLoadIdRef.current) {
        setHistoryError("Could not reach the server");
      }
    } finally {
      if (loadId === historyLoadIdRef.current) setHistoryLoading(false);
    }
  }, []);

  const reload = useCallback(async () => {
    await loadRequests();
    if (historyLoadedRef.current) await loadHistory();
  }, [loadHistory, loadRequests]);

  const releaseBusy = useCallback((ids: string[]) => {
    setBusyIds((prev) => prev.filter((id) => !ids.includes(id)));
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/status")
      .then((res) => res.json())
      .then((data: AuthState) => {
        if (cancelled) return;
        setAuth(data);
        if (data.connected) return loadRequests();
      })
      .catch(() => {
        if (!cancelled) setAuth({ connected: false });
      });
    return () => {
      cancelled = true;
    };
  }, [loadRequests]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const pending = useMemo(
    () => requests.filter((r) => r.status === "pending"),
    [requests]
  );
  const decided = useMemo(
    () =>
      requests
        .filter((r) => r.status !== "pending")
        .sort(
          (a, b) =>
            new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime()
        ),
    [requests]
  );
  const historyMonths = useMemo(
    () =>
      buildHistoryMonths(
        (historyRequests ?? []).filter((r) => r.status !== "pending"),
        new Date()
      ),
    [historyRequests]
  );
  const activeMonth =
    historyMonths.find((m) => m.key === monthKey) ?? historyMonths[0];
  const monthStats = useMemo(() => {
    const items = activeMonth?.requests ?? NO_REQUESTS;
    return {
      total: items.length,
      approved: items.filter((r) => r.status === "approved").length,
      rejected: items.filter((r) => r.status === "rejected").length,
      handled: items.filter((r) => r.status === "handled").length,
    };
  }, [activeMonth]);
  const stats = useMemo(
    () => ({
      pending: pending.length,
      approved: requests.filter((r) => r.status === "approved").length,
      rejected: requests.filter((r) => r.status === "rejected").length,
      handled: requests.filter((r) => r.status === "handled").length,
    }),
    [requests, pending]
  );

  const visible =
    view === "dashboard"
      ? pending
      : view === "history"
        ? (activeMonth?.requests ?? NO_REQUESTS)
        : NO_REQUESTS;
  const filtered = useMemo(
    () => visible.filter((r) => matchesQuery(r, query)),
    [visible, query]
  );
  const groups = useMemo(() => groupByDate(filtered), [filtered]);

  const markHandled = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return;
      setBusyIds((prev) => [...new Set([...prev, ...ids])]);
      try {
        const res = await fetch("/api/mark", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids }),
        });
        if (!res.ok) {
          setToast({ message: "Failed to mark as handled", tone: "error" });
          return;
        }
        setToast({
          message:
            ids.length === 1
              ? "Marked as handled — no mail sent"
              : `${ids.length} requests marked as handled`,
          tone: "success",
        });
        setExiting((prev) => [...new Set([...prev, ...ids])]);
        await wait(EXIT_MS);
        await reload();
      } catch {
        setToast({ message: "Network error", tone: "error" });
      } finally {
        releaseBusy(ids);
      }
    },
    [reload, releaseBusy]
  );

  const undoDecision = useCallback(
    async (r: LeaveRequest) => {
      setBusyIds((prev) => [...new Set([...prev, r.id])]);
      try {
        const res = await fetch("/api/undo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: r.id }),
        });
        if (!res.ok) {
          setToast({ message: "Failed to undo", tone: "error" });
          return;
        }
        setToast({ message: "Moved back to pending", tone: "success" });
        setExiting((prev) => [...new Set([...prev, r.id])]);
        await wait(EXIT_MS);
        await reload();
      } catch {
        setToast({ message: "Network error", tone: "error" });
      } finally {
        releaseBusy([r.id]);
      }
    },
    [reload, releaseBusy]
  );

  const markAllHandled = () => {
    setConfirmClearAll(false);
    markHandled(pending.map((r) => r.id));
  };

  const openDecision = useCallback((r: LeaveRequest, action: Action) => {
    setModal({
      request: r,
      action,
      to: r.employeeEmail,
      cc: r.ccRecipients,
      body: composeDecisionMail({ request: r, action }).body,
      note: "",
      sending: false,
      confirmed: false,
    });
  }, []);

  const confirmDecision = async () => {
    if (!modal) return;
    const id = modal.request.id;
    setModal({ ...modal, sending: true, error: undefined });
    setBusyIds((prev) => [...new Set([...prev, id])]);
    try {
      const res = await fetch("/api/decide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          request: modal.request,
          action: modal.action,
          to: modal.to,
          cc: modal.cc,
          body: modal.body,
          note: modal.note || undefined,
          confirmed: modal.confirmed,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setModal({
          ...modal,
          sending: false,
          error: data.message ?? data.error ?? "Failed to send",
        });
        return;
      }
      setModal(null);
      setToast({
        message: data.alreadyDecided
          ? "Already decided earlier — no duplicate mail sent"
          : `${modal.action === "approved" ? "Approved" : "Rejected"} — mail sent to ${modal.to}`,
        tone: "success",
      });
      setPulse({ id, action: modal.action });
      await wait(PULSE_MS);
      setExiting((prev) => [...new Set([...prev, id])]);
      await wait(EXIT_MS);
      await reload();
    } catch {
      setModal({ ...modal, sending: false, error: "Network error" });
    } finally {
      releaseBusy([id]);
    }
  };

  const disconnectGmail = async () => {
    try {
      const res = await fetch("/api/auth/status", { method: "DELETE" });
      if (!res.ok) {
        setToast({
          message: "Could not disconnect the account",
          tone: "error",
        });
        return;
      }
      setAuth({ connected: false });
      setRequests([]);
      setStatsData(null);
      setStatsError(null);
      historyLoadedRef.current = false;
      setHistoryRequests(null);
      setHistoryError(null);
      setHistoryCapped(false);
      setMonthKey(null);
      setFetchError(null);
      setQuery("");
      setView("dashboard");
      setModal(null);
      setEmailModal(null);
      setShowDirectory(false);
      setToast({
        message: "Gmail disconnected — connect another account to continue",
        tone: "success",
      });
    } catch {
      setToast({ message: "Network error", tone: "error" });
    }
  };

  const lockApp = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      setToast({ message: "Could not reach the server", tone: "error" });
    }
    window.location.href = "/login";
  };

  const connected = auth?.connected === true;
  const copy = PAGE_COPY[view];
  const showSkeleton =
    !auth ||
    (view === "history"
      ? historyLoading && !historyRequests
      : refreshing || (loading && requests.length === 0));
  const modalOpen = Boolean(
    modal || emailModal || showDirectory || confirmClearAll
  );

  const focusSearch = useCallback(() => {
    const desktop = document.getElementById(
      "gl-search"
    ) as HTMLInputElement | null;
    if (desktop && desktop.offsetParent !== null) {
      desktop.focus();
      desktop.select();
      return;
    }
    setMobileSearch(true);
    requestAnimationFrame(() => {
      const mobile = document.getElementById(
        "gl-search-mobile"
      ) as HTMLInputElement | null;
      mobile?.focus();
      mobile?.select();
    });
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat || e.isComposing) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      const typing =
        !!el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.isContentEditable);

      if (e.key === "/" && !typing && !modalOpen) {
        e.preventDefault();
        focusSearch();
        return;
      }
      if (typing || modalOpen || !connected) return;

      if (e.key === "Escape") {
        setSelectedId(null);
        return;
      }

      const key = e.key.toLowerCase();
      const down = e.key === "ArrowDown" || key === "j";
      const up = e.key === "ArrowUp" || key === "k";

      if (down || up) {
        if (filtered.length === 0) return;
        e.preventDefault();
        keyboardNavRef.current = true;
        setSelectedId((current) => {
          const index = filtered.findIndex((r) => r.id === current);
          if (index === -1) return filtered[down ? 0 : filtered.length - 1].id;
          const next = Math.min(
            filtered.length - 1,
            Math.max(0, index + (down ? 1 : -1))
          );
          return filtered[next].id;
        });
        return;
      }

      if (!["a", "r", "h", "e"].includes(key)) return;
      const row = filtered.find((r) => r.id === selectedId);
      if (!row || busyIds.includes(row.id)) return;

      if (key === "e") {
        e.preventDefault();
        setEmailModal(row);
        return;
      }
      if (row.status !== "pending") return;
      e.preventDefault();
      if (key === "a") openDecision(row, "approved");
      else if (key === "r") openDecision(row, "rejected");
      else markHandled([row.id]);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    busyIds,
    connected,
    filtered,
    focusSearch,
    markHandled,
    modalOpen,
    openDecision,
    selectedId,
  ]);

  useEffect(() => {
    if (!selectedId || !keyboardNavRef.current) return;
    keyboardNavRef.current = false;
    const row = document.getElementById(`gl-row-${selectedId}`);
    if (!row) return;
    row.focus({ preventScroll: true });
    row.scrollIntoView({ block: "nearest" });
  }, [selectedId]);

  return (
    <div className="app-bg flex min-h-dvh flex-1 flex-col">
      <Navbar
        view={view}
        onView={(next) => {
          setView(next);
          if (!connected) return;
          if (next === "stats" && !statsData && !statsLoading) loadStats();
          if (next === "history" && !historyRequests && !historyLoading) {
            loadHistory();
          }
        }}
        onDirectory={() => setShowDirectory(true)}
        pendingCount={stats.pending}
        auth={auth}
        loading={
          loading ||
          (view === "stats" && statsLoading) ||
          (view === "history" && historyLoading)
        }
        onSync={() => {
          loadRequests({ skeleton: true });
          if (statsData || view === "stats") loadStats();
          if (historyLoadedRef.current || view === "history") loadHistory();
        }}
        query={query}
        onQuery={setQuery}
        mobileSearch={mobileSearch}
        onMobileSearch={setMobileSearch}
        onDisconnect={disconnectGmail}
        onLock={lockApp}
        onHome={() => {
          setView("dashboard");
          setQuery("");
          if (connected) loadRequests({ skeleton: true });
        }}
      />

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6 lg:py-14">
        {auth && !connected ? (
          <ConnectHero />
        ) : (
          <>
            <div className="mb-8 flex flex-col items-start gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between sm:gap-4">
              <div className="min-w-0">
                <h1 className="text-[30px] font-semibold leading-none tracking-[-0.03em] text-[var(--text-primary)] sm:text-[42px]">
                  {copy.title}
                </h1>
                <p className="mt-3 text-[13px] text-[var(--text-muted)]">
                  {copy.subtitle}
                </p>
              </div>
              {view === "dashboard" && pending.length > 0 && (
                <button
                  onClick={() => setConfirmClearAll(true)}
                  className="press -ml-2.5 inline-flex min-h-10 shrink-0 items-center gap-2 rounded-md px-2.5 py-2 text-[12px] font-medium text-[var(--text-muted)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)] sm:ml-0"
                >
                  Mark all
                  <span className="font-mono">{pending.length}</span>
                  as handled
                </button>
              )}
            </div>

            {view === "stats" ? (
              <StatsView
                data={statsData}
                loading={statsLoading}
                error={statsError}
                onRetry={loadStats}
              />
            ) : (
              <>
                {view === "history" && (
                  <MonthTabs
                    months={historyMonths}
                    active={activeMonth?.key ?? ""}
                    onSelect={(key) => {
                      setMonthKey(key);
                      setSelectedId(null);
                    }}
                  />
                )}

                <section
                  aria-label="Overview"
                  className="border-y border-[var(--border)] py-5"
                >
                  <StatStrip
                    loading={showSkeleton}
                    items={
                      view === "history"
                        ? [
                            {
                              label: "Requests",
                              value: monthStats.total,
                              tone: "neutral",
                            },
                            {
                              label: "Approved",
                              value: monthStats.approved,
                              tone: "emerald",
                            },
                            {
                              label: "Rejected",
                              value: monthStats.rejected,
                              tone: "rose",
                            },
                            {
                              label: "Handled",
                              value: monthStats.handled,
                              tone: "neutral",
                            },
                          ]
                        : [
                            {
                              label: "Pending",
                              value: stats.pending,
                              tone: "amber",
                            },
                            {
                              label: "Approved",
                              value: stats.approved,
                              tone: "emerald",
                            },
                            {
                              label: "Rejected",
                              value: stats.rejected,
                              tone: "rose",
                            },
                            {
                              label: "Handled",
                              value: stats.handled,
                              tone: "neutral",
                            },
                          ]
                    }
                  />
                </section>

                {view === "dashboard" && fetchError && (
                  <p className="mt-6 flex items-start gap-2 border-l-2 border-[var(--signal-red)] py-1 pl-3 text-[13px] text-[var(--c-rose)]">
                    <IconAlert className="mt-0.5 h-4 w-4 shrink-0" />
                    {fetchError}
                  </p>
                )}

                {view === "history" && historyError && (
                  <div className="mt-6">
                    <p className="flex items-start gap-2 border-l-2 border-[var(--signal-red)] py-1 pl-3 text-[13px] text-[var(--c-rose)]">
                      <IconAlert className="mt-0.5 h-4 w-4 shrink-0" />
                      {historyError}
                    </p>
                    <button
                      onClick={loadHistory}
                      className="press mt-5 inline-flex min-h-10 items-center gap-2 rounded-md border border-[var(--border-strong)] bg-[var(--surface-raised)] px-3 py-1.5 text-[12px] font-medium text-[var(--text-secondary)] hover:border-[var(--accent-ring)] hover:bg-[var(--accent-soft)] hover:text-[var(--text-primary)]"
                    >
                      <IconRefresh className="h-3.5 w-3.5" />
                      Try again
                    </button>
                  </div>
                )}

                <div className="mt-10 flex items-baseline justify-between gap-3">
                  <h2 className="text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--text-muted)]">
                    {view === "dashboard"
                      ? "Awaiting decision"
                      : activeMonth
                        ? `Decision log · ${activeMonth.label}`
                        : "Decision log"}
                  </h2>
                  <div className="flex items-center gap-4">
                    {view === "dashboard" && (
                      <span className="touch-hide hidden items-center gap-2 text-[11px] text-[var(--text-muted)] lg:flex">
                        <kbd className="kbd">A</kbd>pprove
                        <kbd className="kbd">R</kbd>eject
                        <kbd className="kbd">H</kbd>andled
                        <kbd className="kbd">E</kbd>mail
                      </span>
                    )}
                    <span className="font-mono text-[11px] tabular-nums text-[var(--text-muted)]">
                      {query.trim()
                        ? `${filtered.length}/${visible.length}`
                        : `${visible.length} ${visible.length === 1 ? "request" : "requests"}`}
                    </span>
                  </div>
                </div>

                <section className="mt-5">
                  {showSkeleton ? (
                    <SkeletonList />
                  ) : groups.length === 0 ? (
                    query.trim() ? (
                      <EmptyState
                        art={<ArtSearch />}
                        title="Nothing matches that search"
                        hint={`No name or code contains “${query.trim()}”.`}
                      />
                    ) : view === "dashboard" ? (
                      <InboxZero count={decided.length} />
                    ) : (
                      <EmptyState
                        art={<ArtTray />}
                        title={
                          activeMonth
                            ? `Nothing actioned in ${activeMonth.label}`
                            : "No decisions yet"
                        }
                        hint="Approvals and rejections for this month will show up here."
                      />
                    )
                  ) : (
                    <div className="space-y-10">
                      {groups.map((group) => (
                        <div key={group.key}>
                          <div className="sticky-date sticky top-[var(--nav-h)] z-20 flex items-baseline gap-3 py-3">
                            <h3 className="text-[26px] font-semibold leading-none tracking-[-0.03em] text-[var(--text-primary)] sm:text-[30px]">
                              {group.label}
                            </h3>
                            {group.sub && (
                              <span className="font-mono text-[12px] uppercase tracking-wide text-[var(--text-muted)]">
                                {group.sub}
                              </span>
                            )}
                            <span className="ml-auto font-mono text-[11px] tabular-nums text-[var(--text-muted)]">
                              {group.items.length}
                            </span>
                          </div>
                          <div className="divide-y divide-[var(--border)] border-y border-[var(--border)]">
                            {group.items.map((r) => (
                              <RequestRow
                                key={r.id}
                                request={r}
                                exiting={exiting.includes(r.id)}
                                pulse={
                                  pulse?.id === r.id ? pulse.action : undefined
                                }
                                selected={selectedId === r.id}
                                busy={busyIds.includes(r.id)}
                                onSelect={() => {
                                  keyboardNavRef.current = false;
                                  setSelectedId(r.id);
                                }}
                                onDecide={(action) => openDecision(r, action)}
                                onMark={() => markHandled([r.id])}
                                onUndo={() => undoDecision(r)}
                                onViewEmail={() => setEmailModal(r)}
                              />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {view === "history" &&
                    historyCapped &&
                    !query.trim() &&
                    !showSkeleton && (
                      <p className="mt-8 border-t border-[var(--border)] pt-4 text-center font-mono text-[11px] text-[var(--text-muted)]">
                        Showing the newest 500 mails in this window
                      </p>
                    )}

                  {view === "dashboard" &&
                    capped &&
                    !query.trim() &&
                    !showSkeleton && (
                      <p className="mt-8 border-t border-[var(--border)] pt-4 text-center text-[11px] text-[var(--text-muted)]">
                        Showing the latest 50 matching requests. Older ones are
                        not shown yet.
                      </p>
                    )}
                </section>
              </>
            )}
          </>
        )}
      </main>

      <Footer />

      {modal && (
        <DecisionModal
          modal={modal}
          onChange={setModal}
          onConfirm={confirmDecision}
          onClose={() => !modal.sending && setModal(null)}
        />
      )}

      {emailModal && (
        <EmailModal request={emailModal} onClose={() => setEmailModal(null)} />
      )}

      {showDirectory && (
        <DirectoryModal
          onClose={() => setShowDirectory(false)}
          onSaved={(count) => {
            setShowDirectory(false);
            setToast({
              message: `Directory updated — ${count} employees saved`,
              tone: "success",
            });
            loadRequests();
          }}
        />
      )}

      {confirmClearAll && (
        <ConfirmModal
          title={`Mark all ${pending.length} pending as handled?`}
          message={
            <>
              This files every pending request under{" "}
              <span className="font-medium text-[var(--text-primary)]">
                Handled
              </span>{" "}
              without sending any email. Use it only for requests you already
              dealt with outside Greenlight.
            </>
          }
          confirmLabel={`Mark ${pending.length} as handled`}
          onConfirm={markAllHandled}
          onClose={() => setConfirmClearAll(false)}
        />
      )}

      {toast && <Toast message={toast.message} tone={toast.tone} />}
    </div>
  );
}
