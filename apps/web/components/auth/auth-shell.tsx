import type { ReactNode } from "react";
import { SiteHeader } from "@/components/site/site-header";
import styles from "./auth.module.css";

/**
 * The frame every signed-out screen stands in.
 *
 * The shared top bar on the white sheet, then two halves: one statement at poster scale on the
 * left, and on the right a single white card holding whatever this screen asks for. At narrow
 * widths the two stack, statement first, so the sentence is still what a person reads before the
 * form. There is no illustration here — that language belongs to the marketing surfaces.
 *
 * A server component with a `children` slot, so a page that needs no client JavaScript (the
 * refused-access screen) ships none.
 */
export function AuthShell({
  accent,
  mark,
  headline,
  lead,
  children,
}: {
  accent: "blue" | "green" | "yellow" | "red";
  mark: ReactNode;
  headline: string;
  lead?: string;
  children: ReactNode;
}) {
  return (
    <div className={styles.page}>
      <SiteHeader />
      <main className={styles.shell}>
        <div className={styles.statement}>
          <span className={styles.tile} data-accent={accent}>
            {mark}
          </span>
          <h1 className={styles.headline}>{headline}</h1>
          {lead ? <p className={styles.lead}>{lead}</p> : null}
        </div>
        <div className={styles.card}>{children}</div>
      </main>
    </div>
  );
}
