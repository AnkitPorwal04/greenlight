"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Logo } from "../components/icons";
import { ThemeToggleIcon } from "../components/ThemeToggle";

export default function LoginPage() {
  const router = useRouter();
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/passcode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode }),
      });
      if (!res.ok) {
        setError("Wrong passcode. Try again.");
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="app-bg relative flex min-h-dvh flex-1 items-center justify-center px-5 pb-[calc(4rem+var(--safe-bottom))] pt-[calc(4rem+var(--safe-top))]">
      <div className="absolute right-4 top-[calc(1rem+var(--safe-top))]">
        <ThemeToggleIcon />
      </div>
      <form onSubmit={submit} className="rise-in w-full max-w-xs">
        <div className="flex items-center gap-2.5">
          <Logo size={26} idSuffix="login" />
          <h1 className="text-[22px] font-semibold tracking-[-0.03em] text-[var(--text-primary)]">
            Greenlight
          </h1>
        </div>
        <p className="mt-6 text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--text-muted)]">
          Passcode
        </p>
        <input
          type="password"
          value={passcode}
          onChange={(e) => setPasscode(e.target.value)}
          placeholder="••••••••"
          autoFocus
          aria-label="Passcode"
          className="field mt-2 w-full rounded-md px-3.5 py-2.5 font-mono text-[13px] tracking-[0.2em] transition"
        />
        {error && (
          <p className="mt-3 border-l-2 border-[var(--signal-red)] pl-2.5 text-[12px] text-[var(--c-rose)]">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={busy || !passcode}
          className="accent press mt-5 w-full rounded-md py-2.5 text-[13px] font-semibold disabled:opacity-50"
        >
          {busy ? "Checking…" : "Unlock"}
        </button>
        <p className="mt-6 flex items-center gap-2 font-mono text-[11px] text-[var(--text-muted)]">
          <span className="lamp-dot lamp-green h-1.5 w-1.5" />
          Leave approvals, straight from your inbox
        </p>
        <p className="mt-8 flex flex-wrap items-center gap-2 font-mono text-[11px] text-[var(--text-muted)]">
          <span className="flex items-center gap-1">
            <span className="lamp-dot lamp-red h-1.5 w-1.5" />
            <span className="lamp-dot lamp-amber h-1.5 w-1.5" />
            <span className="lamp-dot lamp-green h-1.5 w-1.5" />
          </span>
          <span className="uppercase tracking-[0.14em]">
            designed &amp; deployed by
          </span>
          <span className="font-medium text-[var(--text-primary)]">
            Archana &amp; Ankit
          </span>
        </p>
      </form>
    </main>
  );
}
