import { useEffect, useMemo, useState } from "react";
import { Modal, ModalFooter, ModalHeader } from "./Modal";
import { IconAlert, IconSearch, IconUsers, IconX } from "./icons";
import {
  filterPeople,
  normalizeText,
  parseFilterTerms,
  personCodes,
  type Person,
} from "./team-filter";

function personFor(code: string, known: Map<string, Person>): Person {
  return known.get(code) ?? { code, name: code, email: "" };
}

export function MyTeamDialog({
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
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");
  const [confirmRemoveAll, setConfirmRemoveAll] = useState(false);

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
        const people: Person[] = Array.isArray(data.discovered)
          ? data.discovered
          : [];
        setDiscovered(people);
        setSelected(
          new Set(
            (Array.isArray(data.team) ? data.team : []).map((code: string) =>
              normalizeText(code).toUpperCase()
            )
          )
        );
      })
      .catch(() => {
        if (!cancelled) setError("Could not load your team");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const known = useMemo(() => {
    const map = new Map<string, Person>();
    for (const person of discovered) {
      const code = normalizeText(person.code).toUpperCase();
      if (code) map.set(code, person);
    }
    return map;
  }, [discovered]);

  const roster = useMemo(
    () =>
      [...selected]
        .map((code) => personFor(code, known))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [selected, known]
  );

  const terms = useMemo(() => parseFilterTerms(query), [query]);
  const candidates = useMemo(
    () => filterPeople(discovered, query),
    [discovered, query]
  );
  const shownCodes = useMemo(() => personCodes(candidates), [candidates]);
  const shownSelectedCount = shownCodes.filter((code) =>
    selected.has(code)
  ).length;

  const dropConfirm = () => setConfirmRemoveAll(false);

  const toggle = (code: string) => {
    dropConfirm();
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const addShown = () => {
    dropConfirm();
    setSelected((prev) => new Set([...prev, ...shownCodes]));
  };

  const removeAll = () => {
    setSelected(new Set());
    setConfirmRemoveAll(false);
  };

  const openAdd = () => {
    dropConfirm();
    setAdding(true);
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
    <Modal size="wide" onClose={() => !busy && onClose()}>
      <ModalHeader
        title={
          <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            My team
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--surface-raised)] px-2.5 py-1">
              <span
                className={`lamp-dot h-1.5 w-1.5 ${
                  selected.size > 0 ? "lamp-green" : ""
                }`}
              />
              <span className="font-mono text-[12px] font-medium tabular-nums text-[var(--text-secondary)]">
                {loading ? "—" : selected.size}
              </span>
            </span>
          </span>
        }
        subtitle="Dashboard, History and Stats show only these people. Leave the team empty to show everyone."
      />

      <div className="flex min-h-0 flex-1 flex-col px-4 py-4 sm:px-6 sm:py-5">
        {adding ? (
          <>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-[13px] font-medium text-[var(--text-primary)]">
                Add members
              </p>
              <button
                onClick={() => setAdding(false)}
                className="press min-h-9 rounded-md px-2.5 py-1.5 text-[12px] font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)]"
              >
                Back to roster
              </button>
            </div>

            <div className="relative mb-3">
              <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search name, code or email — paste a list to filter many"
                aria-label="Search people by name, code or email"
                className={`field w-full rounded-md py-2.5 pl-9 text-[13px] ${
                  terms.length > 1 ? "pr-20" : "pr-3"
                }`}
              />
              {terms.length > 1 && (
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[11px] tabular-nums text-[var(--text-muted)]">
                  {terms.length} filters
                </span>
              )}
            </div>

            <div className="mb-2 flex items-center gap-3 text-[11px]">
              <button
                onClick={addShown}
                disabled={
                  shownCodes.length === 0 ||
                  shownSelectedCount === shownCodes.length
                }
                className="font-medium text-[var(--text-secondary)] transition hover:text-[var(--accent)] disabled:opacity-40"
              >
                {terms.length > 0
                  ? `Add all ${shownCodes.length} shown`
                  : "Add everyone"}
              </button>
              <span className="text-[var(--border-strong)]">·</span>
              <span className="font-mono tabular-nums text-[var(--text-muted)]">
                {shownSelectedCount}/{shownCodes.length} on the team
              </span>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto rounded-md border border-[var(--border)]">
              {loading ? (
                <div className="space-y-2 p-3">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <div key={i} className="skeleton h-9 w-full rounded" />
                  ))}
                </div>
              ) : candidates.length === 0 ? (
                <p className="p-6 text-center text-[13px] text-[var(--text-muted)]">
                  {discovered.length === 0
                    ? "No people found in your recent leave mails yet."
                    : terms.length > 1
                      ? "No one matches those filters."
                      : "No one matches that search."}
                </p>
              ) : (
                <ul className="divide-y divide-[var(--border)]">
                  {candidates.map((person) => {
                    const code = normalizeText(person.code).toUpperCase();
                    const on = selected.has(code);
                    return (
                      <li key={code}>
                        <label className="flex cursor-pointer items-center gap-3 px-3 py-3 hover:bg-[var(--surface-raised)] sm:py-2.5">
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={() => toggle(code)}
                            className="h-4 w-4 shrink-0 accent-[var(--accent)]"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-medium text-[var(--text-primary)]">
                              {person.name}
                            </span>
                            <span className="block truncate font-mono text-[11px] text-[var(--text-muted)]">
                              {code}
                              {person.email ? ` · ${person.email}` : ""}
                            </span>
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-[13px] font-medium text-[var(--text-primary)]">
                Roster
              </p>
              <button
                onClick={openAdd}
                disabled={loading}
                className="accent press min-h-9 shrink-0 rounded-md px-3 py-2 text-[12px] font-semibold disabled:opacity-40"
              >
                Add members
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto rounded-md border border-[var(--border)]">
              {loading ? (
                <div className="space-y-2 p-3">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <div key={i} className="skeleton h-11 w-full rounded" />
                  ))}
                </div>
              ) : roster.length === 0 ? (
                <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
                  <IconUsers className="h-6 w-6 text-[var(--text-muted)]" />
                  <p className="text-[13px] text-[var(--text-secondary)]">
                    Nobody on your team yet — Greenlight will show everyone.
                  </p>
                  <button
                    onClick={openAdd}
                    className="accent press min-h-10 rounded-md px-3.5 py-2.5 text-[12px] font-semibold"
                  >
                    Add members
                  </button>
                </div>
              ) : (
                <ul className="divide-y divide-[var(--border)]">
                  {roster.map((person) => {
                    const code = normalizeText(person.code).toUpperCase();
                    return (
                      <li
                        key={code}
                        className="flex items-center gap-3 px-3 py-2.5 transition hover:bg-[var(--surface-raised)] sm:px-4"
                      >
                        <span className="lamp-dot lamp-green h-1.5 w-1.5 shrink-0" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-medium text-[var(--text-primary)]">
                            {person.name}
                          </span>
                          <span className="block truncate text-[11px] text-[var(--text-muted)]">
                            <span className="font-mono">{code}</span>
                            {person.email ? ` · ${person.email}` : ""}
                          </span>
                        </span>
                        <button
                          onClick={() => toggle(code)}
                          aria-label={`Remove ${person.name} from your team`}
                          className="press flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-[var(--text-muted)] transition hover:bg-[var(--bg)] hover:text-[var(--c-rose)] sm:h-9 sm:w-9"
                        >
                          <IconX className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </>
        )}

        {error && (
          <p className="mt-3 flex items-start gap-2 border-l-2 border-[var(--signal-red)] py-1 pl-3 text-[12px] text-[var(--c-rose)]">
            <IconAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {error}
          </p>
        )}
      </div>

      <ModalFooter>
        <button
          onClick={() =>
            confirmRemoveAll ? removeAll() : setConfirmRemoveAll(true)
          }
          disabled={busy || loading || selected.size === 0}
          className={`press mr-auto min-h-10 rounded-md px-3 py-2.5 text-[13px] font-medium disabled:opacity-40 ${
            confirmRemoveAll
              ? "bg-[var(--signal-red)] text-[var(--danger-on)] hover:brightness-110"
              : "text-[var(--c-rose)] hover:bg-[var(--surface-raised)]"
          }`}
        >
          {confirmRemoveAll ? "Sure? Remove all" : "Remove all"}
        </button>
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
