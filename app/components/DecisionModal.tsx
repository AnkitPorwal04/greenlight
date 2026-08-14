import { FieldLabel, Modal, ModalFooter, ModalHeader } from "./Modal";
import { IconAlert, IconCheckCircle } from "./icons";
import { dateRange, dayCount, type ModalState } from "./utils";

export function DecisionModal({
  modal,
  onChange,
  onConfirm,
  onClose,
}: {
  modal: ModalState;
  onChange: (m: ModalState) => void;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const { request: r, action } = modal;
  const approving = action === "approved";

  return (
    <Modal onClose={onClose}>
      <ModalHeader
        title={
          <>
            {approving ? "Approve" : "Reject"} {r.employeeName}&apos;s{" "}
            {r.leaveType.toLowerCase() || "leave"}
          </>
        }
        subtitle={`${dateRange(r)} · ${dayCount(r.numberOfDays)} · ${r.employeeCode}`}
      />

      <div className="space-y-4 px-5 py-4">
        <label className="block">
          <FieldLabel>Send to</FieldLabel>
          <input
            value={modal.to}
            onChange={(e) => onChange({ ...modal, to: e.target.value })}
            placeholder="employee@company.com"
            className="field w-full rounded-lg px-3 py-2 text-sm transition"
          />
          <span
            className={`mt-1.5 flex items-center gap-1.5 text-[11px] ${
              r.emailVerified
                ? "text-[var(--c-emerald)]"
                : "text-[var(--c-amber)]"
            }`}
          >
            {r.emailVerified ? (
              <IconCheckCircle className="h-3.5 w-3.5" />
            ) : (
              <IconAlert className="h-3.5 w-3.5" />
            )}
            {r.emailVerified
              ? "✓ Verified from employee directory"
              : "⚠ Guessed from name — double-check before sending"}
          </span>
        </label>

        {r.ccRecipients.length > 0 && (
          <div>
            <FieldLabel>CC</FieldLabel>
            <div className="flex flex-wrap gap-1.5">
              {r.ccRecipients.map((cc) => (
                <span
                  key={cc}
                  className="rounded-md border border-[var(--border)] bg-[var(--surface-raised)] px-2 py-1 text-[11px] text-[var(--text-secondary)]"
                >
                  {cc}
                </span>
              ))}
            </div>
          </div>
        )}

        <label className="block">
          <FieldLabel>Personal note (optional)</FieldLabel>
          <textarea
            value={modal.note}
            onChange={(e) => onChange({ ...modal, note: e.target.value })}
            rows={3}
            placeholder={
              approving
                ? "e.g. Stay safe in the rain!"
                : "e.g. We have a client demo that day"
            }
            className="field w-full resize-none rounded-lg px-3 py-2 text-sm transition"
          />
        </label>

        {modal.error && (
          <p className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-[var(--c-rose)]">
            <IconAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {modal.error}
          </p>
        )}
      </div>

      <ModalFooter>
        <button
          onClick={onClose}
          disabled={modal.sending}
          className="rounded-lg px-3 py-2 text-sm font-medium text-[var(--text-secondary)] transition hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)] disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          disabled={modal.sending || !modal.to.trim()}
          className={`rounded-lg px-4 py-2 text-sm font-semibold text-white transition disabled:opacity-50 ${
            approving
              ? "bg-emerald-600 hover:bg-emerald-500"
              : "bg-rose-600 hover:bg-rose-500"
          }`}
        >
          {modal.sending
            ? "Sending…"
            : approving
              ? "Send approval mail"
              : "Send rejection mail"}
        </button>
      </ModalFooter>
    </Modal>
  );
}
