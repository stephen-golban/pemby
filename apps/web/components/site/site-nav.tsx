"use client";

import { useEffect, useId, useRef, useState } from "react";
import styles from "./site-header.module.css";

type NavItem = { href: string; label: string };

type SiteNavProps = {
  /** Accessible name of the navigation landmark. */
  label: string;
  /** Visible text of the small-screen disclosure button. */
  menuLabel: string;
  items: readonly NavItem[];
};

/**
 * Primary navigation. Wide screens show the links inline; narrow screens collapse them behind a
 * disclosure button (aria-expanded + aria-controls). Escape and a click outside close the panel,
 * and focus returns to the button when Escape closes it.
 */
export function SiteNav({ label, menuLabel, items }: SiteNavProps) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const navRef = useRef<HTMLElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    function onPointer(event: PointerEvent) {
      if (navRef.current && !navRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  return (
    <nav ref={navRef} aria-label={label} className={styles.nav} data-open={open || undefined}>
      <button
        ref={buttonRef}
        type="button"
        className={styles.menuButton}
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((value) => !value)}
      >
        <span>{menuLabel}</span>
        <svg className={styles.menuIcon} viewBox="0 0 20 20" aria-hidden="true" focusable="false">
          <path
            d="M3 7h14M3 13h14"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </button>
      <ul id={listId} className={styles.navList}>
        {items.map((item) => (
          <li key={item.href}>
            <a className={styles.navLink} href={item.href} onClick={() => setOpen(false)}>
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
