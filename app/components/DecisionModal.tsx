import { useState } from "react";
import { FieldLabel, Modal, ModalFooter, ModalHeader } from "./Modal";
import { IconAlert, IconCheckCircle, IconX } from "./icons";
import { dateRange, dayCount, isEmail, type ModalState } from "./utils";
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
              ? "Verified from employee directory"
              : "Guessed from name — double-check before sending"}
          </span>
        </label>

        <div>
          <FieldLabel>CC</FieldLabel>
          <CcEditor
            cc={modal.cc}
            onChange={(cc) => onChange({ ...modal, cc })}
          />
        </div>

        <MailBody modal={modal} onChange={onChange} />

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

function CcEditor({
  cc,
  onChange,
}: {
  cc: string[];
  onChange: (cc: string[]) => void;
}) {
  const [text, setText] = useState("");
  const [warn, setWarn] = useState(false);

  const commit = () => {
    const parts = text.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
    if (parts.length === 0) {
      setText("");
      return;
    }
    const additions: string[] = [];
    let bad = false;
    for (const p of parts) {
      if (!isEmail(p)) bad = true;
      else if (!cc.includes(p) && !additions.includes(p)) additions.push(p);
    }
    if (additions.length) onChange([...cc, ...additions]);
    setText("");
    setWarn(bad);
  };

  const remove = (addr: string) => onChange(cc.filter((c) => c !== addr));

  return (
    <div>
      <div className="field flex flex-wrap gap-1.5 rounded-lg p-2">
        {cc.map((addr) => (
          <span
            key={addr}
            className="inline-flex max-w-full items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--surface-raised)] px-2 py-1 text-[11px] text-[var(--text-secondary)]"
          >
            <span className="truncate">{addr}</span>
            <button
              type="button"
              onClick={() => remove(addr)}
              aria-label={`Remove ${addr}`}
              className="shrink-0 text-[var(--text-muted)] transition hover:text-[var(--c-rose)]"
            >
              <IconX className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (warn) setWarn(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              commit();
            } else if (e.key === "Backspace" && !text && cc.length) {
              remove(cc[cc.length - 1]);
            }
          }}
          onBlur={commit}
          placeholder={cc.length ? "Add more…" : "Add CC email…"}
          aria-label="Add CC recipient"
          className="min-w-[8rem] flex-1 bg-transparent px-1 py-0.5 text-xs text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
        />
      </div>
      {warn && (
        <span className="mt-1.5 block text-[11px] text-[var(--c-amber)]">
          That doesn&apos;t look like a valid email address.
        </span>
      )}
    </div>
  );
}

function MailBody({
  modal,
  onChange,
}: {
  modal: ModalState;
  onChange: (m: ModalState) => void;
}) {
  const { subject, body: defaultBody } = composeDecisionMail({
    request: modal.request,
    action: modal.action,
  });
  const edited = modal.body !== defaultBody;

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-[var(--text-secondary)]">
          Message
        </span>
        {edited && (
          <button
            type="button"
            onClick={() => onChange({ ...modal, body: defaultBody })}
            className="text-[11px] font-medium text-[var(--text-muted)] transition hover:text-[var(--accent)]"
          >
            Reset to default
          </button>
        )}
      </div>
      <div className="field overflow-hidden rounded-lg">
        <p className="break-words border-b border-[var(--border)] px-3 py-2 text-[13px] font-semibold text-[var(--text-primary)]">
          {subject}
        </p>
        <textarea
          value={modal.body}
          onChange={(e) => onChange({ ...modal, body: e.target.value })}
          rows={5}
          spellCheck
          aria-label="Mail body"
          className="block max-h-[40dvh] min-h-[7rem] w-full resize-y bg-transparent px-3 py-2.5 font-sans text-[13px] leading-relaxed text-[var(--text-primary)] outline-none"
        />
      </div>
      <p className="mt-1.5 text-[11px] text-[var(--text-muted)]">
        Your Gmail signature is appended automatically.
      </p>
    </div>
  );
}
