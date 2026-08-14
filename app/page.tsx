"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DecisionModal } from "./components/DecisionModal";
import { DirectoryModal } from "./components/DirectoryModal";
import { EmailModal } from "./components/EmailModal";
import { RequestRow } from "./components/RequestRow";
import { Footer, Navbar } from "./components/Shell";
import { StatTile } from "./components/StatTile";
import {
  ConnectHero,
  EmptyState,
  InboxZero,
  SkeletonList,
  Toast,
} from "./components/States";
import {
  IconAlert,
  IconCheckCircle,
  IconClock,
  IconInbox,
  IconXCircle,
} from "./components/icons";
import {
  groupByDate,
  matchesQuery,
  type AuthState,
  type ModalState,
  type View,
} from "./components/utils";
import type { LeaveRequest } from "@/lib/types";

const PAGE_COPY: Record<View, { title: string; subtitle: string }> = {
  dashboard: {
    title: "Dashboard",
    subtitle: "Leave requests waiting on your decision, newest first.",
  },
  history: {
    title: "History",
    subtitle: "Every request you have already actioned, newest first.",
  },
};

export default function Home() {
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [emailModal, setEmailModal] = useState<LeaveRequest | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [view, setView] = useState<View>("dashboard");
  const [showDirectory, setShowDirectory] = useState(false);
  const [query, setQuery] = useState("");

  const loadRequests = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch("/api/leaves");
      const data = await res.json();
      if (!res.ok) {
        if (data.error !== "not_connected") setFetchError(data.error);
        setRequests([]);
        return;
      }
      setRequests(data.requests);
    } catch {
      setFetchError("Could not reach the server");
    } finally {
      setLoading(false);
    }
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
  const history = useMemo(
    () => requests.filter((r) => r.status !== "pending"),
    [requests]
  );
  const stats = useMemo(
    () => ({
      pending: pending.length,
      approved: requests.filter((r) => r.status === "approved").length,
      rejected: requests.filter((r) => r.status === "rejected").length,
      total: requests.length,
    }),
    [requests, pending]
  );

  const visible = view === "dashboard" ? pending : history;
  const filtered = useMemo(
    () => visible.filter((r) => matchesQuery(r, query)),
    [visible, query]
  );
  const groups = useMemo(() => groupByDate(filtered), [filtered]);

  const markHandled = async (ids: string[]) => {
    try {
      const res = await fetch("/api/mark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) {
        setToast("Failed to mark as handled");
        return;
      }
      setToast(
        ids.length === 1
          ? "Marked as handled — no mail sent"
          : `${ids.length} requests marked as handled`
      );
      loadRequests();
    } catch {
      setToast("Network error");
    }
  };

  const markAllHandled = () => {
    if (
      window.confirm(
        `Mark all ${pending.length} pending requests as handled? No mails will be sent — use this to clear requests you already dealt with outside Greenlight.`
      )
    ) {
      markHandled(pending.map((r) => r.id));
    }
  };

  const confirmDecision = async () => {
    if (!modal) return;
    setModal({ ...modal, sending: true, error: undefined });
    try {
      const res = await fetch("/api/decide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          request: modal.request,
          action: modal.action,
          to: modal.to,
          cc: modal.request.ccRecipients,
          note: modal.note || undefined,
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
      setToast(
        `${modal.action === "approved" ? "Approved" : "Rejected"} — mail sent to ${modal.to}`
      );
      loadRequests();
    } catch {
      setModal({ ...modal, sending: false, error: "Network error" });
    }
  };

  const disconnectGmail = async () => {
    try {
      const res = await fetch("/api/auth/status", { method: "DELETE" });
      if (!res.ok) {
        setToast("Could not disconnect the account");
        return;
      }
      setAuth({ connected: false });
      setRequests([]);
      setFetchError(null);
      setQuery("");
      setView("dashboard");
      setModal(null);
      setEmailModal(null);
      setShowDirectory(false);
      setToast("Gmail disconnected — connect another account to continue");
    } catch {
      setToast("Network error");
    }
  };

  const lockApp = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      setToast("Could not reach the server");
    }
    window.location.href = "/login";
  };

  const connected = auth?.connected === true;
  const copy = PAGE_COPY[view];
  const showSkeleton = !auth || (loading && requests.length === 0);

  return (
    <div className="app-bg flex min-h-screen flex-1 flex-col">
      <Navbar
        view={view}
        onView={setView}
        onDirectory={() => setShowDirectory(true)}
        pendingCount={stats.pending}
        historyCount={history.length}
        auth={auth}
        loading={loading}
        onSync={loadRequests}
        query={query}
        onQuery={setQuery}
        onDisconnect={disconnectGmail}
        onLock={lockApp}
      />

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-7 sm:px-6 lg:py-9">
        {auth && !connected ? (
          <ConnectHero />
        ) : (
          <>
            <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
                  {copy.title}
                </h1>
                <p className="mt-1 text-sm text-[var(--text-muted)]">
                  {copy.subtitle}
                </p>
              </div>
              {view === "dashboard" && pending.length > 0 && (
                <button
                  onClick={markAllHandled}
                  className="shrink-0 rounded-lg border border-[var(--border)] px-3 py-2.5 text-xs font-medium text-[var(--text-secondary)] transition hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] md:py-2"
                >
                  Mark all {pending.length} as handled
                </button>
              )}
            </div>

            <section
              aria-label="Overview"
              className="grid grid-cols-2 gap-3 lg:grid-cols-4"
            >
              <StatTile
                label="Pending"
                value={stats.pending}
                tone="amber"
                loading={showSkeleton}
                icon={<IconClock />}
              />
              <StatTile
                label="Approved"
                value={stats.approved}
                tone="emerald"
                loading={showSkeleton}
                icon={<IconCheckCircle />}
              />
              <StatTile
                label="Rejected"
                value={stats.rejected}
                tone="rose"
                loading={showSkeleton}
                icon={<IconXCircle />}
              />
              <StatTile
                label="Total"
                value={stats.total}
                tone="indigo"
                loading={showSkeleton}
                icon={<IconInbox />}
              />
            </section>

            {fetchError && (
              <p className="mt-4 flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2.5 text-sm text-[var(--c-rose)]">
                <IconAlert className="mt-0.5 h-4 w-4 shrink-0" />
                {fetchError}
              </p>
            )}

            <div className="mt-8 flex items-center justify-between gap-3 border-b border-[var(--border)] pb-3">
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                {view === "dashboard" ? "Awaiting decision" : "Decision log"}
              </h2>
              <span className="text-xs tabular-nums text-[var(--text-muted)]">
                {query.trim()
                  ? `${filtered.length} of ${visible.length}`
                  : `${visible.length} ${visible.length === 1 ? "request" : "requests"}`}
              </span>
            </div>

            <section className="mt-5">
              {showSkeleton ? (
                <SkeletonList />
              ) : groups.length === 0 ? (
                query.trim() ? (
                  <EmptyState
                    emoji="🔍"
                    title="No requests match your search"
                    hint={`Nothing here for “${query.trim()}”.`}
                  />
                ) : view === "dashboard" ? (
                  <InboxZero count={history.length} />
                ) : (
                  <EmptyState
                    emoji="🗂️"
                    title="No decisions yet"
                    hint="Approvals and rejections will show up here."
                  />
                )
              ) : (
                <div className="space-y-6">
                  {groups.map((group) => (
                    <div key={group.key}>
                      <div className="sticky-date sticky top-[var(--nav-h)] z-20 flex items-center gap-2.5 py-2">
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                          {group.label}
                        </h3>
                        <span className="rounded bg-[var(--surface-raised)] px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-[var(--text-secondary)]">
                          {group.items.length}
                        </span>
                        <span className="h-px flex-1 bg-[var(--border)]" />
                      </div>
                      <div className="panel divide-y divide-[var(--border)] overflow-hidden rounded-xl">
                        {group.items.map((r) => (
                          <RequestRow
                            key={r.id}
                            request={r}
                            onDecide={(action) =>
                              setModal({
                                request: r,
                                action,
                                to: r.employeeEmail,
                                note: "",
                                sending: false,
                              })
                            }
                            onMark={() => markHandled([r.id])}
                            onViewEmail={() => setEmailModal(r)}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
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
            setToast(`Directory updated — ${count} employees saved`);
            loadRequests();
          }}
        />
      )}

      {toast && <Toast message={toast} />}
    </div>
  );
}
