"use client";

import { useEffect, useRef, type ReactNode } from "react";
import styles from "./brief.module.css";

/**
 * The inline disclosure both one-tap pickers open in.
 *
 * Inline rather than a modal: neither picking a reason nor reporting a post needs protected focus,
 * and a dialog over a ledger row hides the row you are deciding about. Opening moves focus to the
 * first option and Escape closes, so the whole thing is reachable from the keyboard without a
 * focus trap.
 */
export function Picker({
  title,
  note,
  onClose,
  closeLabel,
  children,
}: {
  title: string;
  note?: string;
  onClose: () => void;
  closeLabel: string;
  children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Where focus came from, so closing can hand it back: this picker takes focus on open, and a
    // control that takes focus owes it to return it rather than dropping the reader at the top of
    // the document (WCAG 2.2, focus order).
    const opener = document.activeElement;
    panel.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => {
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, []);

  return (
    <div
      ref={panel}
      className={styles.picker}
      role="group"
      aria-label={title}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <p className={styles.pickerTitle}>{title}</p>
      <div className={styles.options}>{children}</div>
      {note ? <p className={styles.pickerNote}>{note}</p> : null}
      <button type="button" className={styles.textAction} onClick={onClose}>
        {closeLabel}
      </button>
    </div>
  );
}

/** One option in a picker: an outline pill, the Operate secondary action of DESIGN.md. */
export function Option({
  label,
  onSelect,
  disabled,
}: {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
}) {
  return (
    <button type="button" className={styles.pill} onClick={onSelect} disabled={disabled}>
      {label}
    </button>
  );
}
