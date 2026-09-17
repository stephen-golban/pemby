import type { ReactNode } from "react";
import styles from "./profile.module.css";

/**
 * "12 roles hire from Moldova": the count badge from DESIGN.md (ink pill, ground numerals, tabular
 * figures) leading a grotesk line. `count` null with `pending` shows a dashed empty badge while the
 * number is being worked out; the onboarding counter updates `count` optimistically and the badge
 * keeps its width steady with tabular numerals. `as` sets the element (a heading on the landing).
 */
export function MatchCounter({
  count,
  label,
  pending = false,
  as: Tag = "p",
  id,
}: {
  count: number | null;
  label: ReactNode;
  pending?: boolean;
  as?: "p" | "h2" | "h3";
  id?: string;
}) {
  return (
    <Tag className={styles.counter} id={id} data-pending={pending}>
      <span className={styles.badge} data-empty={count === null}>
        {count === null ? null : count}
      </span>
      <span className={styles.counterLabel}>{label}</span>
    </Tag>
  );
}
