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

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
        <div className="overflow-hidden rounded-md border-l-2 border-[var(--border-strong)] bg-[var(--surface-sunken)]">
          <pre className="max-h-[55dvh] overflow-y-auto whitespace-pre-wrap break-words px-3.5 py-3 font-sans text-[13px] leading-relaxed text-[var(--text-secondary)]">
            {body || "This email had no plain-text body."}
          </pre>
        </div>
      </div>

      <ModalFooter>
        <a
          href={`https://mail.google.com/mail/u/0/#all/${r.threadId}`}
          target="_blank"
          rel="noreferrer"
          className="press inline-flex min-h-10 items-center rounded-md px-3 py-2.5 text-[13px] font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)]"
        >
          Open in Gmail
        </a>
        <button
          onClick={onClose}
          className="accent press min-h-10 rounded-md px-4 py-2.5 text-[13px] font-semibold"
        >
          Close
        </button>
      </ModalFooter>
    </Modal>
  );
}
