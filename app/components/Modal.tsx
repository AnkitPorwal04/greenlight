"use client";

import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  type ReactNode,
} from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

const ModalTitleContext = createContext<string | undefined>(undefined);

export function Modal({
  children,
  onClose,
  dismissible = true,
  size = "default",
}: {
  children: ReactNode;
  onClose: () => void;
  dismissible?: boolean;
  size?: "default" | "wide";
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  // Hold the latest onClose without re-running the setup effect (which would
  // steal focus back to the first field on every parent re-render / keystroke).
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusables = () => {
      const panel = panelRef.current;
      return panel
        ? Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
            (el) => el.offsetParent !== null
          )
        : [];
    };

    // Move focus into the dialog on open.
    (focusables()[0] ?? panelRef.current)?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;

      const panel = panelRef.current;
      const items = focusables();
      if (items.length === 0) {
        e.preventDefault();
        panel?.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !panel?.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !panel?.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={() => dismissible && onClose()}
      className="fixed inset-0 z-50 flex items-end justify-center bg-[var(--overlay)] p-3 pb-[max(0.75rem,var(--safe-bottom))] pt-[max(0.75rem,var(--safe-top))] backdrop-blur-[2px] sm:items-center sm:p-4"
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className={`rise-in panel flex max-h-[88dvh] w-full flex-col overflow-hidden rounded-xl shadow-2xl shadow-[var(--shadow)] outline-none sm:max-h-[85dvh] ${
          size === "wide" ? "max-w-2xl sm:max-h-[88dvh]" : "max-w-lg"
        }`}
      >
        <ModalTitleContext.Provider value={titleId}>
          {children}
        </ModalTitleContext.Provider>
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
  const titleId = useContext(ModalTitleContext);
  return (
    <div className="shrink-0 border-b border-[var(--border)] px-4 py-4 sm:px-5">
      <h2
        id={titleId}
        className="break-words text-[17px] font-semibold tracking-tight text-[var(--text-primary)]"
      >
        {title}
      </h2>
      {subtitle && (
        <p className="mt-1.5 break-words font-mono text-[11px] text-[var(--text-muted)]">
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
    <span className="mb-2 block text-[10px] font-medium uppercase tracking-[0.16em] text-[var(--text-muted)]">
      {children}
    </span>
  );
}
