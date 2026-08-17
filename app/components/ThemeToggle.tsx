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
      data-tip="Switch the vibe"
      className="tip press flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-[var(--text-secondary)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)] md:h-9 md:w-9"
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
