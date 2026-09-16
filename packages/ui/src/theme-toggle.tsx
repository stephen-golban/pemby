"use client";

import { useSyncExternalStore } from "react";
import { applyTheme, resolvedTheme } from "./theme";
import styles from "./theme-toggle.module.css";

function subscribe(onChange: () => void): () => void {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  media.addEventListener("change", onChange);
  return () => {
    observer.disconnect();
    media.removeEventListener("change", onChange);
  };
}

type ThemeToggleProps = {
  /** Accessible name, from the i18n layer, for example "Dark theme". */
  label: string;
  className?: string;
};

/** A pressed-state button: pressed means the dark theme is on. */
export function ThemeToggle({ label, className }: ThemeToggleProps) {
  const isDark = useSyncExternalStore(
    subscribe,
    () => resolvedTheme() === "dark",
    () => false,
  );

  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={isDark}
      className={className ? `${styles.toggle} ${className}` : styles.toggle}
      onClick={() => applyTheme(isDark ? "light" : "dark")}
    >
      <svg className={styles.icon} viewBox="0 0 34 34" aria-hidden="true" focusable="false">
        <circle cx="17" cy="17" r="14.5" fill="none" stroke="currentColor" strokeWidth="2.5" />
        <path d="M17 2.5a14.5 14.5 0 0 0 0 29z" fill="currentColor" />
      </svg>
    </button>
  );
}
