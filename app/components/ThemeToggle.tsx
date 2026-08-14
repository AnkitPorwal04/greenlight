"use client";

import { useState } from "react";
import { IconMoon, IconSun } from "./icons";

type Theme = "light" | "dark";

function readTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  return document.documentElement.classList.contains("light")
    ? "light"
    : "dark";
}

function applyTheme(next: Theme) {
  document.documentElement.classList.toggle("light", next === "light");
  try {
    window.localStorage.setItem("gl_theme", next);
  } catch {
    return;
  }
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(readTheme);

  const toggle = () => {
    const next: Theme = theme === "light" ? "dark" : "light";
    applyTheme(next);
    setTheme(next);
  };

  return (
    <button
      onClick={toggle}
      aria-label="Toggle colour theme"
      title="Toggle colour theme"
      className="flex w-full items-center gap-2.5 rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-medium text-[var(--text-secondary)] transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)]"
    >
      <span className="theme-when-dark flex items-center gap-2.5">
        <IconSun className="h-3.5 w-3.5" />
        Light mode
      </span>
      <span className="theme-when-light flex items-center gap-2.5">
        <IconMoon className="h-3.5 w-3.5" />
        Dark mode
      </span>
    </button>
  );
}

export function ThemeToggleIcon() {
  const [theme, setTheme] = useState<Theme>(readTheme);

  const toggle = () => {
    const next: Theme = theme === "light" ? "dark" : "light";
    applyTheme(next);
    setTheme(next);
  };

  return (
    <button
      onClick={toggle}
      aria-label="Toggle colour theme"
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--text-secondary)] transition hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] md:h-9 md:w-9"
    >
      <span className="theme-when-dark flex">
        <IconSun className="h-4 w-4" />
      </span>
      <span className="theme-when-light flex">
        <IconMoon className="h-4 w-4" />
      </span>
    </button>
  );
}
