import type { ReactNode } from "react";

export function Modal({
  children,
  onClose,
}: {
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-end justify-center bg-[var(--overlay)] p-4 backdrop-blur-[2px] sm:items-center"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="rise-in panel flex max-h-[85dvh] w-full max-w-lg flex-col overflow-hidden rounded-2xl shadow-2xl shadow-[var(--shadow)]"
      >
        {children}
      </div>
    </div>
  );
}

export function ModalHeader({
  title,
  subtitle,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
}) {
  return (
    <div className="shrink-0 border-b border-[var(--border)] px-4 py-4 sm:px-5">
      <h2 className="break-words text-base font-semibold text-[var(--text-primary)]">
        {title}
      </h2>
      {subtitle && (
        <p className="mt-1 break-words text-xs text-[var(--text-muted)]">
          {subtitle}
        </p>
      )}
    </div>
  );
}

export function ModalFooter({ children }: { children: ReactNode }) {
  return (
    <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-[var(--border)] px-4 py-3 sm:px-5 sm:py-4">
      {children}
    </div>
  );
}

export function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <span className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">
      {children}
    </span>
  );
}
