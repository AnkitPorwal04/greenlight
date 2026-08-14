import { Modal, ModalFooter, ModalHeader } from "./Modal";
import { clockTime, dayLabel } from "./utils";
import type { LeaveRequest } from "@/lib/types";

export function EmailModal({
  request: r,
  onClose,
}: {
  request: LeaveRequest;
  onClose: () => void;
}) {
  const received = [dayLabel(r.receivedAt), clockTime(r.receivedAt)]
    .filter(Boolean)
    .join(" · ");
  const body = r.bodyText?.trim();

  return (
    <Modal onClose={onClose}>
      <ModalHeader
        title="Original email"
        subtitle={received ? `${r.employeeName} · ${received}` : r.employeeName}
      />

      <div className="px-5 py-4">
        <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-raised)]">
          <pre className="max-h-[60vh] overflow-y-auto whitespace-pre-wrap break-words px-3 py-2.5 font-sans text-xs leading-relaxed text-[var(--text-secondary)]">
            {body || "This email had no plain-text body."}
          </pre>
        </div>
      </div>

      <ModalFooter>
        <a
          href={`https://mail.google.com/mail/u/0/#all/${r.threadId}`}
          target="_blank"
          rel="noreferrer"
          className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium text-[var(--text-secondary)] transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)]"
        >
          Open in Gmail
        </a>
        <button
          onClick={onClose}
          className="accent rounded-lg px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110"
        >
          Close
        </button>
      </ModalFooter>
    </Modal>
  );
}
