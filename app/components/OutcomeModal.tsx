import type { RecordedStatus } from "@/lib/outcome";
import type { LeaveRequest } from "@/lib/types";
import { Modal, ModalFooter, ModalHeader } from "./Modal";

const OPTIONS: {
  status: RecordedStatus;
  label: string;
  hint: string;
  lamp: string;
}[] = [
  {
    status: "approved",
    label: "Accepted",
    hint: "Records this as approved",
    lamp: "lamp-green",
  },
  {
    status: "rejected",
    label: "Rejected",
    hint: "Records this as rejected",
    lamp: "lamp-red",
  },
  {
    status: "withdrawn",
    label: "Withdrawn by employee",
    hint: "Pulled back in greytHR before a decision",
    lamp: "lamp-hollow",
  },
  {
    status: "handled",
    label: "Handled by another team lead",
    hint: "Records this as handled",
    lamp: "",
  },
];

export function OutcomeModal({
  request,
  busy,
  onPick,
  onClose,
}: {
  request: LeaveRequest;
  busy?: boolean;
  onPick: (status: RecordedStatus) => void;
  onClose: () => void;
}) {
  return (
    <Modal onClose={() => !busy && onClose()}>
      <ModalHeader
        title="How was this handled?"
        subtitle={`${request.employeeName} · ${request.employeeCode}`}
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
        <p className="mb-3 text-[13px] leading-relaxed text-[var(--text-secondary)]">
          This only records the outcome for a request you already resolved
          elsewhere. No email is sent.
        </p>
        <div
          role="group"
          aria-label="Recorded outcome"
          className="flex flex-col gap-2"
        >
          {OPTIONS.map((option) => (
            <button
              key={option.status}
              onClick={() => onPick(option.status)}
              disabled={busy}
              aria-label={`${option.label} — ${option.hint}, no mail sent`}
              className="press flex min-h-11 w-full items-center gap-3 rounded-md border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2.5 text-left hover:border-[var(--accent-ring)] hover:bg-[var(--accent-soft)] disabled:opacity-50"
            >
              <span
                className={`lamp-dot h-2 w-2 shrink-0 ${option.lamp}`}
                aria-hidden="true"
              />
              <span className="min-w-0">
                <span className="block break-words text-[13px] font-medium text-[var(--text-primary)]">
                  {option.label}
                </span>
                <span className="mt-0.5 block break-words font-mono text-[11px] text-[var(--text-muted)]">
                  {option.hint}
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>

      <ModalFooter>
        <button
          onClick={onClose}
          disabled={busy}
          className="press min-h-10 rounded-md px-3 py-2.5 text-[13px] font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)] disabled:opacity-50"
        >
          Cancel
        </button>
      </ModalFooter>
    </Modal>
  );
}
