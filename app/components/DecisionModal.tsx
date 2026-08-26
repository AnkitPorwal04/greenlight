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
  const defaultBody = composeDecisionMail({ request: r, action }).body;
  const edited = modal.body !== defaultBody;

  // Trusted only when the address is the one verified from the directory and
  // hasn't been changed. Anything else (a guessed address, or a hand-typed one)
  // needs the manager to explicitly confirm before it can be sent.
  const trusted =
    r.emailVerified &&
    modal.to.trim().toLowerCase() ===
      (r.employeeEmail || "").trim().toLowerCase();
  const blocked = !trusted && !modal.confirmed;

  return (
    <Modal onClose={onClose} dismissible={!edited}>
      <ModalHeader
        title={
          <>
            {approving ? "Approve" : "Reject"} {r.employeeName}&apos;s{" "}
            {r.leaveType.toLowerCase() || "leave"}
            {r.kind === "cancellation" ? " cancellation" : ""}
          </>
        }
        subtitle={`${dateRange(r)} · ${dayCount(r.numberOfDays)} · ${r.employeeCode}`}
      />

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5">
        <div>
          <FieldLabel>Send to</FieldLabel>
          <input
            value={modal.to}
            onChange={(e) =>
              onChange({ ...modal, to: e.target.value, confirmed: false })
            }
            placeholder="employee@company.com"
            aria-label="Reply address"
            className="field w-full rounded-md px-3 py-2.5 font-mono text-[13px] transition"
          />
          <span
            className={`mt-1.5 flex items-start gap-1.5 text-[11px] ${
              trusted ? "text-[var(--c-emerald)]" : "text-[var(--c-amber)]"
            }`}
          >
            {trusted ? (
              <IconCheckCircle className="mt-px h-3.5 w-3.5 shrink-0" />
            ) : (
              <IconAlert className="mt-px h-3.5 w-3.5 shrink-0" />
            )}
            {trusted
              ? "Verified from employee directory"
              : "Not verified — this address was guessed or edited. Confirm it below before sending."}
          </span>

          {!trusted && (
            <label className="mt-2 flex cursor-pointer items-start gap-2.5 rounded-md border border-[var(--border)] bg-[var(--surface-raised)] p-2.5 text-[12px] leading-relaxed text-[var(--text-secondary)]">
              <input
                type="checkbox"
                checked={modal.confirmed}
                onChange={(e) =>
                  onChange({ ...modal, confirmed: e.target.checked })
                }
                className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent)]"
              />
              <span>
                I confirm{" "}
                <span className="break-all font-mono text-[var(--text-primary)]">
                  {modal.to.trim() || "this address"}
                </span>{" "}
                is the correct email for {r.employeeName}.
              </span>
            </label>
          )}
        </div>

        <div>
          <FieldLabel>CC</FieldLabel>
          <CcEditor
            cc={modal.cc}
            onChange={(cc) => onChange({ ...modal, cc })}
          />
        </div>

        <MailBody
          modal={modal}
          onChange={onChange}
          defaultBody={defaultBody}
          edited={edited}
        />

        {modal.error && (
          <p className="flex items-start gap-2 border-l-2 border-[var(--signal-red)] py-1 pl-3 text-[12px] text-[var(--c-rose)]">
            <IconAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {modal.error}
          </p>
        )}
      </div>

      <ModalFooter>
        <button
          onClick={onClose}
          disabled={modal.sending}
          className="press min-h-10 rounded-md px-3 py-2.5 text-[13px] font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)] disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          disabled={modal.sending || !modal.to.trim() || blocked}
          title={blocked ? "Confirm the recipient address first" : undefined}
          className={`press min-h-10 rounded-md px-4 py-2.5 text-[13px] font-semibold disabled:opacity-50 ${
            approving
              ? "accent"
              : "bg-[var(--signal-red)] text-[var(--danger-on)] hover:brightness-110"
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
      <div className="field flex flex-wrap gap-1.5 rounded-md p-2">
        {cc.map((addr) => (
          <span
            key={addr}
            className="inline-flex max-w-full items-center gap-1 rounded bg-[var(--surface-raised)] px-2 py-1 font-mono text-[11px] text-[var(--text-secondary)]"
          >
            <span className="truncate">{addr}</span>
            <button
              type="button"
              onClick={() => remove(addr)}
              aria-label={`Remove ${addr}`}
              className="-mr-1 flex h-6 w-6 shrink-0 items-center justify-center rounded text-[var(--text-muted)] transition hover:text-[var(--c-rose)]"
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
          className="min-w-[8rem] flex-1 bg-transparent px-1 py-0.5 font-mono text-[12px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
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
  defaultBody,
  edited,
}: {
  modal: ModalState;
  onChange: (m: ModalState) => void;
  defaultBody: string;
  edited: boolean;
}) {
  const { subject } = composeDecisionMail({
    request: modal.request,
    action: modal.action,
  });

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-[var(--text-muted)]">
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
      <div className="field overflow-hidden rounded-md">
        <p className="break-words border-b border-[var(--border)] px-3 py-2 text-[13px] font-semibold tracking-tight text-[var(--text-primary)]">
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
