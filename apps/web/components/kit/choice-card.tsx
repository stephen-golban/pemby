"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./kit.module.css";

export interface ChoiceAction {
  label: string;
  /** An internal route. Exactly one of `href` and `onClick`. */
  href?: string;
  onClick?: () => void;
  primary?: boolean;
  busy?: boolean;
}

/**
 * The outlined paper card that carries a state which is an answer rather than an empty screen —
 * the same object the Brief uses for honest silence (DESIGN.md: one paper card, 1.5px outline, the
 * card shadow, no tilt).
 *
 * Every use of it on this page says the same three things in the same order: what is true, why, and
 * the ways on. It is the surface for a spent quota (a pass, or your own OpenRouter account), for an
 * unfinished profile, for a missing CV, and for a key that has stopped working.
 */
export function ChoiceCard({
  title,
  body,
  actions,
  children,
}: {
  title: string;
  body: string;
  actions: readonly ChoiceAction[];
  /** A second sentence or a note under the actions, when one is worth saying. */
  children?: ReactNode;
}) {
  return (
    <section className={styles.choice}>
      <h2 className={styles.choiceTitle}>{title}</h2>
      <p className={styles.choiceBody}>{body}</p>
      {actions.length > 0 ? (
        <div className={styles.choiceActions}>
          {actions.map((action) =>
            action.href ? (
              <Link
                key={action.label}
                href={action.href}
                className={action.primary ? styles.primary : styles.pill}
              >
                {action.label}
              </Link>
            ) : (
              <button
                key={action.label}
                type="button"
                className={action.primary ? styles.primary : styles.pill}
                disabled={action.busy}
                onClick={action.onClick}
              >
                {action.label}
              </button>
            ),
          )}
        </div>
      ) : null}
      {children}
    </section>
  );
}
