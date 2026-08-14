import { useState } from "react";
import { FieldLabel, Modal, ModalFooter, ModalHeader } from "./Modal";
import { IconAlert } from "./icons";

export function DirectoryModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: (count: number) => void;
}) {
  const [raw, setRaw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/employees", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raw }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message ?? data.error ?? "Failed to save");
        return;
      }
      onSaved(data.count);
    } catch {
      setError("Network error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={() => !busy && onClose()}>
      <ModalHeader
        title="Employee directory"
        subtitle="Requests are matched by employee code so decision mails reach the exact right address."
      />

      <div className="px-5 py-4">
        <label className="block">
          <FieldLabel>
            Paste CSV{" "}
            <span className="rounded bg-[var(--surface-raised)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-primary)]">
              code,name,email
            </span>{" "}
            or a JSON array
          </FieldLabel>
          <textarea
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            rows={9}
            placeholder={
              "GRP1931,Prem Ayer,prem.ayer@ethara.ai\nGRP1820,Dimple Soni,dimple.soni@ethara.ai"
            }
            className="field w-full resize-none rounded-lg px-3 py-2.5 font-mono text-xs leading-relaxed transition"
          />
        </label>
        {error && (
          <p className="mt-3 flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-[var(--c-rose)]">
            <IconAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {error}
          </p>
        )}
      </div>

      <ModalFooter>
        <button
          onClick={onClose}
          disabled={busy}
          className="rounded-lg px-3 py-2 text-sm font-medium text-[var(--text-secondary)] transition hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)] disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          onClick={save}
          disabled={busy || !raw.trim()}
          className="accent rounded-lg px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save directory"}
        </button>
      </ModalFooter>
    </Modal>
  );
}
