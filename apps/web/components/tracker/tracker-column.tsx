"use client";

import type { TrackerRowView } from "@/app/api/applications/_lib/view";
import { Ledger } from "@/app/profile/_shared/fields";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { TrackerRow, type TrackerRowActions } from "./tracker-row";
import styles from "./tracker.module.css";

/**
 * One column of the board, as a ruled section rather than a lane.
 *
 * The head is a count badge and an uppercase mono label — the DESIGN.md ledger head — and it stays
 * when the column is empty. "Offer 0" is a fact a person tracking applications wants to read, and a
 * board that changes shape every time a row moves cannot be scanned from memory. An empty column
 * carries an outline badge instead of a filled one, so the zero reads as zero at a glance without
 * the page needing a second colour for it.
 */
export function TrackerColumn({
  label,
  lead,
  rows,
  actions,
  hasCountry,
  movedJobId,
}: {
  label: string;
  /** One mono line under the head; only the off-board section has one. */
  lead?: string;
  rows: readonly TrackerRowView[];
  actions: TrackerRowActions;
  hasCountry: boolean;
  /** The row the person just moved, wherever it has landed. See `TrackerRow`'s `justMoved`. */
  movedJobId: string | null;
}) {
  const t = useTranslations("Tracker");
  const headId = useId();
  const empty = rows.length === 0;

  return (
    <section className={styles.column} aria-labelledby={headId} data-empty={empty}>
      <h2 className={styles.head} id={headId}>
        <span className={styles.badge}>{rows.length}</span>
        <span className={styles.columnLabel}>{label}</span>
      </h2>
      {lead ? <p className={styles.columnLead}>{lead}</p> : null}
      {empty ? (
        <p className={styles.columnEmpty}>{t("emptyColumn")}</p>
      ) : (
        <Ledger labelledBy={headId}>
          {rows.map((row) => (
            <TrackerRow
              key={row.jobId}
              row={row}
              actions={actions}
              hasCountry={hasCountry}
              justMoved={row.jobId === movedJobId}
            />
          ))}
        </Ledger>
      )}
    </section>
  );
}
