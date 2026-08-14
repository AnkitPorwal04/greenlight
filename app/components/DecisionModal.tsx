import { FieldLabel, Modal, ModalFooter, ModalHeader } from "./Modal";
import { IconAlert, IconCheckCircle } from "./icons";
import { dateRange, dayCount, type ModalState } from "./utils";
import { composeDecisionMail } from "@/lib/compose";

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

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5">
        <label className="block">
          <FieldLabel>Send to</FieldLabel>
          <input
            value={modal.to}
            onChange={(e) => onChange({ ...modal, to: e.target.value })}
            placeholder="employee@company.com"
            className="field w-full rounded-lg px-3 py-2.5 text-sm transition"
          />
          <span
            className={`mt-1.5 flex items-start gap-1.5 text-[11px] ${
              r.emailVerified
                ? "text-[var(--c-emerald)]"
                : "text-[var(--c-amber)]"
            }`}
          >
            {r.emailVerified ? (
              <IconCheckCircle className="mt-px h-3.5 w-3.5 shrink-0" />
            ) : (
              <IconAlert className="mt-px h-3.5 w-3.5 shrink-0" />
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
                  className="max-w-full break-all rounded-md border border-[var(--border)] bg-[var(--surface-raised)] px-2 py-1 text-[11px] text-[var(--text-secondary)]"
                >
                  {cc}
                </span>
              ))}
            </div>
          </div>
        )}

        <MailPreview modal={modal} />

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
          className="min-h-10 rounded-lg px-3 py-2.5 text-sm font-medium text-[var(--text-secondary)] transition hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)] disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          disabled={modal.sending || !modal.to.trim()}
          className={`min-h-10 rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition disabled:opacity-50 ${
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

function MailPreview({ modal }: { modal: ModalState }) {
  const { subject, body } = composeDecisionMail({
    request: modal.request,
    action: modal.action,
  });

  return (
    <div>
      <FieldLabel>Mail preview</FieldLabel>
      <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-raised)]">
        <p className="break-words border-b border-[var(--border)] px-3 py-2 text-xs font-semibold text-[var(--text-primary)]">
          {subject}
        </p>
        <pre className="max-h-[30dvh] overflow-y-auto whitespace-pre-wrap break-words px-3 py-2.5 font-sans text-xs leading-relaxed text-[var(--text-secondary)]">
          {body}
        </pre>
      </div>
      <p className="mt-1.5 text-[11px] text-[var(--text-muted)]">
        Your Gmail signature is appended automatically.
      </p>
    </div>
  );
}
