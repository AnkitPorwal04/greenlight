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

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 text-sm leading-relaxed text-[var(--text-secondary)] sm:px-5">
        {message}
      </div>

      <ModalFooter>
        <button
          onClick={onClose}
          disabled={busy}
          className="min-h-10 rounded-lg px-3 py-2.5 text-sm font-medium text-[var(--text-secondary)] transition hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)] disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          disabled={busy}
          className={`min-h-10 rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition disabled:opacity-50 ${
            tone === "danger"
              ? "bg-rose-600 hover:bg-rose-500"
              : "accent hover:brightness-110"
          }`}
        >
          {confirmLabel}
        </button>
      </ModalFooter>
    </Modal>
  );
}
