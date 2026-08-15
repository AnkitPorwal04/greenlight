type IconProps = { className?: string };

function base(className?: string) {
  return className ?? "h-4 w-4";
}

export function IconCheck({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={base(className)}
      aria-hidden="true"
    >
      <path d="M4.5 12.5l4.5 4.5 10.5-10.5" />
    </svg>
  );
}

export function IconCheckCircle({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={base(className)}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M8.25 12.25l2.5 2.5 5-5.5" />
    </svg>
  );
}

export function IconX({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={base(className)}
      aria-hidden="true"
    >
      <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
    </svg>
  );
}

export function IconSearch({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={base(className)}
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4 4" />
    </svg>
  );
}

export function IconRefresh({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={base(className)}
      aria-hidden="true"
    >
      <path d="M20 11a8 8 0 10-.7 4.6" />
      <path d="M20 5.5V11h-5.5" />
    </svg>
  );
}

export function IconUsers({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={base(className)}
      aria-hidden="true"
    >
      <circle cx="9.5" cy="8.5" r="3.2" />
      <path d="M3.5 19.5c0-3.2 2.7-5 6-5s6 1.8 6 5" />
      <path d="M16 5.6a3.2 3.2 0 010 5.9" />
      <path d="M18 14.9c2 .7 3.5 2.2 3.5 4.6" />
    </svg>
  );
}

export function IconMail({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={base(className)}
      aria-hidden="true"
    >
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="M3.8 7l7.1 5.3a2 2 0 002.2 0L20.2 7" />
    </svg>
  );
}

export function IconAlert({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={base(className)}
      aria-hidden="true"
    >
      <path d="M10.7 4.3L2.9 17.5A1.5 1.5 0 004.2 19.8h15.6a1.5 1.5 0 001.3-2.3L13.3 4.3a1.5 1.5 0 00-2.6 0z" />
      <path d="M12 9.5v4M12 16.6v.01" />
    </svg>
  );
}

export function IconChevron({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={base(className)}
      aria-hidden="true"
    >
      <path d="M6 9.5l6 6 6-6" />
    </svg>
  );
}

export function IconSun({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={base(className)}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2.2M12 19.3v2.2M4.2 4.2l1.6 1.6M18.2 18.2l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.2 19.8l1.6-1.6M18.2 5.8l1.6-1.6" />
    </svg>
  );
}

export function IconMoon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={base(className)}
      aria-hidden="true"
    >
      <path d="M20 13.6A8.2 8.2 0 1110.4 4a6.6 6.6 0 009.6 9.6z" />
    </svg>
  );
}

export function Logo({
  size = 28,
  idSuffix = "main",
}: {
  size?: number;
  idSuffix?: string;
}) {
  const glow = `gl-glow-${idSuffix}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      role="img"
      aria-label="Greenlight"
      className="shrink-0"
    >
      <defs>
        <radialGradient id={glow} cx="0.5" cy="0.5" r="0.5">
          <stop stopColor="#22c55e" stopOpacity="0.55" />
          <stop offset="1" stopColor="#22c55e" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill="#0c110e" />
      <rect
        x="0.6"
        y="0.6"
        width="30.8"
        height="30.8"
        rx="7.4"
        stroke="#22c55e"
        strokeOpacity="0.22"
        strokeWidth="1.2"
      />
      <circle cx="16" cy="8.6" r="2.4" fill="#3a3123" />
      <circle cx="16" cy="16" r="2.4" fill="#3a2326" />
      <circle cx="16" cy="23.4" r="7" fill={`url(#${glow})`} />
      <circle cx="16" cy="23.4" r="3.1" fill="#22c55e" />
    </svg>
  );
}

export function StatusLamp({
  status,
  pulse,
  className,
}: {
  status: string;
  pulse?: "approved" | "rejected";
  className?: string;
}) {
  const lamps: {
    key: string;
    lit: string;
    dim: string;
    on: boolean;
    breathe?: boolean;
  }[] = [
    {
      key: "amber",
      lit: "lamp-amber",
      dim: "lamp-dim-amber",
      on: !pulse && status === "pending",
      breathe: true,
    },
    {
      key: "red",
      lit: "lamp-red",
      dim: "lamp-dim-red",
      on: pulse ? pulse === "rejected" : status === "rejected",
    },
    {
      key: "green",
      lit: "lamp-green",
      dim: "lamp-dim-green",
      on: pulse ? pulse === "approved" : status === "approved",
    },
  ];
  return (
    <span
      aria-hidden="true"
      className={`inline-flex flex-col items-center gap-[3px] rounded-full border border-[var(--border)] px-[3px] py-[4px] ${
        className ?? ""
      }`}
    >
      {lamps.map((l) => (
        <span
          key={l.key}
          className={`lamp-dot h-[5px] w-[5px] ${l.on ? l.lit : l.dim} ${
            l.on && l.breathe && !pulse ? "lamp-breathe" : ""
          } ${l.on && pulse ? "lamp-pulse" : ""}`}
        />
      ))}
    </span>
  );
}

export function IconLock({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={base(className)}
      aria-hidden="true"
    >
      <rect x="4.5" y="10.5" width="15" height="9.5" rx="2.4" />
      <path d="M8 10.5V8a4 4 0 018 0v2.5" />
    </svg>
  );
}

export function IconLogout({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={base(className)}
      aria-hidden="true"
    >
      <path d="M14.5 4.5h3a2 2 0 012 2v11a2 2 0 01-2 2h-3" />
      <path d="M9.5 8.5L5.5 12l4 3.5M5.5 12h9" />
    </svg>
  );
}

export function IconGithub({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={base(className)}
      aria-hidden="true"
    >
      <path d="M12 2.2a9.8 9.8 0 00-3.1 19.1c.49.09.67-.21.67-.47l-.01-1.83c-2.73.59-3.3-1.15-3.3-1.15-.45-1.14-1.09-1.44-1.09-1.44-.9-.61.07-.6.07-.6 1 .07 1.52 1.02 1.52 1.02.88 1.51 2.31 1.07 2.88.82.09-.64.34-1.07.63-1.32-2.18-.25-4.48-1.09-4.48-4.86 0-1.07.39-1.95 1.02-2.64-.1-.25-.44-1.26.1-2.62 0 0 .83-.27 2.73 1.01a9.4 9.4 0 014.96 0c1.9-1.28 2.73-1.01 2.73-1.01.54 1.36.2 2.37.1 2.62.63.69 1.02 1.57 1.02 2.64 0 3.78-2.31 4.61-4.5 4.85.35.31.67.91.67 1.85l-.01 2.74c0 .26.18.57.68.47A9.8 9.8 0 0012 2.2z" />
    </svg>
  );
}

export function IconUndo({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={base(className)}
      aria-hidden="true"
    >
      <path d="M4 9.5h10.5a5 5 0 010 10H9" />
      <path d="M7.5 5.5L3.5 9.5l4 4" />
    </svg>
  );
}

export function IconArrowRight({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={base(className)}
      aria-hidden="true"
    >
      <path d="M4.5 12h14M13 6.5l5.5 5.5-5.5 5.5" />
    </svg>
  );
}
