import type { ReactNode } from "react";
import { Modal, ModalFooter, ModalHeader } from "./Modal";

export function ConfirmModal({
  title,
  message,
  confirmLabel,
  tone = "accent",
  busy,
  onConfirm,
  onClose,
}: {
  title: string;
  message: ReactNode;
  confirmLabel: string;
  tone?: "accent" | "danger";
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal onClose={() => !busy && onClose()}>
      <ModalHeader title={title} />

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 text-[13px] leading-relaxed text-[var(--text-secondary)] sm:px-5">
        {message}
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
          onClick={onConfirm}
          disabled={busy}
          className={`press min-h-10 rounded-md px-4 py-2.5 text-[13px] font-semibold disabled:opacity-50 ${
            tone === "danger"
              ? "bg-[var(--signal-red)] text-[var(--danger-on)] hover:brightness-110"
              : "accent"
          }`}
        >
          {confirmLabel}
        </button>
      </ModalFooter>
    </Modal>
  );
}
