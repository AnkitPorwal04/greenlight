import { useEffect, useMemo, useState } from "react";
import { Modal, ModalFooter, ModalHeader } from "./Modal";
import { IconAlert, IconCheckCircle, IconSearch } from "./icons";
import {
  filterPeople,
  normalizeText,
  parseFilterTerms,
  personCodes,
  type Person,
} from "./team-filter";

export function TeamModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: (count: number) => void;
}) {
  const [discovered, setDiscovered] = useState<Person[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  // Bulk paste
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [matched, setMatched] = useState<Set<string>>(new Set());
  const [notFound, setNotFound] = useState<string[]>([]);
  const [pasteDone, setPasteDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/team")
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data.error) {
          setError(
            data.error === "not_connected"
              ? "Gmail is not connected"
              : data.error
          );
          return;
        }
        setDiscovered(Array.isArray(data.discovered) ? data.discovered : []);
        setSelected(
          new Set(
            (Array.isArray(data.team) ? data.team : []).map((c: string) =>
              c.toUpperCase()
            )
          )
        );
      })
      .catch(() => {
        if (!cancelled) setError("Could not load your people");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const terms = useMemo(() => parseFilterTerms(query), [query]);

  const filtered = useMemo(() => {
    const rows = filterPeople(discovered, query);
    // Float the people matched by the last paste to the top for easy review.
    return [...rows].sort((a, b) => {
      const am = matched.has(a.code.toUpperCase()) ? 0 : 1;
      const bm = matched.has(b.code.toUpperCase()) ? 0 : 1;
      if (am !== bm) return am - bm;
      return a.name.localeCompare(b.name);
    });
  }, [discovered, query, matched]);

  const toggle = (code: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const shownCodes = useMemo(() => personCodes(filtered), [filtered]);
  const isFiltered = terms.length > 0;
  const shownSelectedCount = shownCodes.filter((code) =>
    selected.has(code)
  ).length;

  const selectAll = () =>
    setSelected((prev) => new Set([...prev, ...shownCodes]));

  const clearAll = () =>
    setSelected((prev) => {
      if (!isFiltered) return new Set<string>();
      const next = new Set(prev);
      for (const code of shownCodes) next.delete(code);
      return next;
    });

  const applyPaste = () => {
    const emails = [
      ...new Set(
        pasteText
          .split(/[\s,;]+/)
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean)
      ),
    ];
    const byEmail = new Map(
      discovered
        .map((p) => [normalizeText(p.email), p] as const)
        .filter(([email]) => email)
    );
    const hitCodes = new Set<string>();
    const misses: string[] = [];
    for (const e of emails) {
      const person = byEmail.get(e);
      if (person) hitCodes.add(person.code.toUpperCase());
      else misses.push(e);
    }
    setSelected((prev) => new Set([...prev, ...hitCodes]));
    setMatched(hitCodes);
    setNotFound(misses);
    setPasteDone(true);
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/team", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codes: [...selected] }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message ?? data.error ?? "Failed to save");
        return;
      }
      onSaved(data.count ?? selected.size);
    } catch {
      setError("Network error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={() => !busy && onClose()}>
      <ModalHeader
        title="My team"
        subtitle="Pick the people who are actually on your team. Dashboard, History and Stats will then show only them. Leave empty to show everyone."
      />

      <div className="flex min-h-0 flex-1 flex-col px-4 py-4 sm:px-5">
        {/* Bulk paste */}
        <div className="mb-3 rounded-md border border-[var(--border)]">
          <button
            onClick={() => setPasteOpen((v) => !v)}
            aria-expanded={pasteOpen}
            className="flex w-full items-center justify-between px-3 py-2.5 text-left text-[13px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            Paste a list of emails
            <span className="text-[var(--text-muted)]">
              {pasteOpen ? "–" : "+"}
            </span>
          </button>
          {pasteOpen && (
            <div className="border-t border-[var(--border)] p-3">
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                rows={3}
                placeholder={"jane@company.com, john@company.com\nsara@company.com"}
                aria-label="Paste emails"
                className="field w-full resize-none rounded-md px-3 py-2 font-mono text-[12px] leading-relaxed"
              />
              <div className="mt-2 flex items-center gap-3">
                <button
                  onClick={applyPaste}
                  disabled={!pasteText.trim() || loading}
                  className="accent press min-h-8 rounded-md px-3 py-1.5 text-[12px] font-semibold disabled:opacity-40"
                >
                  Match &amp; select
                </button>
                {pasteDone && (
                  <span className="inline-flex items-center gap-1.5 text-[11px] text-[var(--c-emerald)]">
                    <IconCheckCircle className="h-3.5 w-3.5" />
                    Matched {matched.size}{" "}
                    {matched.size === 1 ? "person" : "people"}
                  </span>
                )}
              </div>
              {pasteDone && notFound.length > 0 && (
                <p className="mt-2 flex items-start gap-2 text-[11px] text-[var(--c-amber)]">
                  <IconAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span className="min-w-0 break-words">
                    Not found ({notFound.length}): {notFound.join(", ")}
                  </span>
                </p>
              )}
            </div>
          )}
        </div>

        <div className="mb-3 flex items-center gap-2">
          <div className="relative flex-1">
            <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, code or email — paste a list to filter many"
              aria-label="Search people by name, code or email"
              className={`field w-full rounded-md py-2 pl-9 text-[13px] ${
                terms.length > 1 ? "pr-20" : "pr-3"
              }`}
            />
            {terms.length > 1 && (
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[11px] tabular-nums text-[var(--text-muted)]">
                {terms.length} filters
              </span>
            )}
          </div>
          <span className="shrink-0 font-mono text-[11px] tabular-nums text-[var(--text-muted)]">
            {selected.size} selected
          </span>
        </div>

        <div className="mb-2 flex items-center gap-3 text-[11px]">
          <button
            onClick={selectAll}
            disabled={shownCodes.length === 0 || shownSelectedCount === shownCodes.length}
            className="font-medium text-[var(--text-secondary)] transition hover:text-[var(--accent)] disabled:opacity-40"
          >
            {isFiltered ? `Select all ${shownCodes.length} shown` : "Select all"}
          </button>
          <span className="text-[var(--border-strong)]">·</span>
          <button
            onClick={clearAll}
            disabled={isFiltered ? shownSelectedCount === 0 : selected.size === 0}
            className="font-medium text-[var(--text-secondary)] transition hover:text-[var(--accent)] disabled:opacity-40"
          >
            {isFiltered ? `Clear ${shownSelectedCount} shown` : "Clear"}
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto rounded-md border border-[var(--border)]">
          {loading ? (
            <div className="space-y-2 p-3">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="skeleton h-9 w-full rounded" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <p className="p-6 text-center text-[13px] text-[var(--text-muted)]">
              {discovered.length === 0
                ? "No people found in your recent leave mails yet."
                : terms.length > 1
                  ? "No one matches those filters."
                  : "No one matches that search."}
            </p>
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {filtered.map((p) => {
                const code = p.code.toUpperCase();
                const on = selected.has(code);
                const isMatch = matched.has(code);
                return (
                  <li key={code}>
                    <label
                      className={`flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-[var(--surface-raised)] ${
                        isMatch ? "bg-[var(--accent-soft)]" : ""
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => toggle(code)}
                        className="h-4 w-4 shrink-0 accent-[var(--accent)]"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium text-[var(--text-primary)]">
                          {p.name}
                        </span>
                        <span className="block truncate font-mono text-[11px] text-[var(--text-muted)]">
                          {code}
                          {p.email ? ` · ${p.email}` : ""}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {error && (
          <p className="mt-3 flex items-start gap-2 border-l-2 border-[var(--signal-red)] py-1 pl-3 text-[12px] text-[var(--c-rose)]">
            <IconAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {error}
          </p>
        )}
      </div>

      <ModalFooter>
        <button
          onClick={onClose}
          disabled={busy}
          className="press min-h-10 rounded-md px-3 py-2.5 text-[13px] font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)] disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          onClick={save}
          disabled={busy || loading}
          className="accent press min-h-10 rounded-md px-4 py-2.5 text-[13px] font-semibold disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save team"}
        </button>
      </ModalFooter>
    </Modal>
  );
}
