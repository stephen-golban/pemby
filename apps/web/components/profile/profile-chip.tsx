import type { ReactNode } from "react";
import styles from "./profile.module.css";

/**
 * A single value in a list of values (a stack item, a domain, a language). The job-chip look from
 * DESIGN.md: surface fill, hairline, 8px corners, 13px mono. Not interactive by itself; an
 * editable chip (onboarding) wraps it in its own button.
 */
export function ProfileChip({ children, detail }: { children: ReactNode; detail?: ReactNode }) {
  return (
    <li className={styles.chip}>
      <span>{children}</span>
      {detail ? <span className={styles.chipDetail}>{detail}</span> : null}
    </li>
  );
}

export function ProfileChipList({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <ul className={styles.chips} aria-label={label}>
      {children}
    </ul>
  );
}
