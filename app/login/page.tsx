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
    <main className="app-bg relative flex min-h-screen flex-1 items-center justify-center px-4">
      <div className="absolute right-4 top-4">
        <ThemeToggleIcon />
      </div>
      <form
        onSubmit={submit}
        className="panel rise-in w-full max-w-sm rounded-2xl p-8 text-center"
      >
        <div className="mx-auto mb-5 flex w-fit">
          <Logo size={44} idSuffix="login" />
        </div>
        <h1 className="text-lg font-semibold tracking-tight text-[var(--text-primary)]">
          Greenlight
        </h1>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          Enter your passcode to access the dashboard
        </p>
        <input
          type="password"
          value={passcode}
          onChange={(e) => setPasscode(e.target.value)}
          placeholder="Passcode"
          autoFocus
          className="field mt-6 w-full rounded-lg px-4 py-2.5 text-center text-sm transition"
        />
        {error && (
          <p className="mt-3 text-xs text-[var(--c-rose)]">{error}</p>
        )}
        <button
          type="submit"
          disabled={busy || !passcode}
          className="accent mt-5 w-full rounded-lg py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
        >
          {busy ? "Checking…" : "Unlock"}
        </button>
      </form>
    </main>
  );
}
