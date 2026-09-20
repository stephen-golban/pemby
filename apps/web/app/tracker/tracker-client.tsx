"use client";

import type { TrackerRowView, TrackerView } from "@/app/api/applications/_lib/view";
import { TrackerColumn, type TrackerRowActions } from "@/components/tracker";
import { TRACKER_COLUMNS, trackerColumnOf, type TrackerColumn as Column } from "@pemby/core";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useId, useState } from "react";
import { useTracker } from "./_shared/use-tracker";
import styles from "./tracker.module.css";

/**
 * Sort every row into its column, using the **one** mapping.
 *
 * `trackerColumnOf` lives in `@pemby/core` and the worker calls the same function when it rewrites
 * a Telegram card, which is the whole reason the column is computed here rather than sent down the
 * wire already decided: two implementations of one mapping is how the board a person sees on their
 * phone and the board they see in a browser come to disagree about whether they have an interview.
 *
 * A `null` column is a real answer — withdrawn, no answer, a passed match — and those rows go to
 * their own section rather than being dropped. `selectTracker`'s pre-filter is deliberately wider
 * than the mapping, so rows that map to nothing do arrive here and must be handled.
 */
function sort(rows: readonly TrackerRowView[]) {
  const columns = new Map<Column, TrackerRowView[]>(TRACKER_COLUMNS.map((name) => [name, []]));
  const off: TrackerRowView[] = [];
  for (const row of rows) {
    const column = trackerColumnOf({
      matchState: row.matchState,
      applicationState: row.applicationState,
    });
    if (column === null) off.push(row);
    else columns.get(column)?.push(row);
  }
  return { columns, off };
}

/**
 * `/tracker` — what you applied to and where each one stands (PLAN D9).
 *
 * Five ruled sections down the page, not five lanes across it. The lanes are the category's reflex
 * and they are wrong twice here: boxed cards in columns are exactly what DESIGN.md's ledger rule
 * rules out, and at 390px four of the five would be off-screen on the surface that most wants to be
 * read on a phone.
 *
 * Every change is optimistic and rolls back with its reason (`_shared/use-tracker.ts`). Because the
 * rows travel as facts rather than as columns, a state change re-runs the mapping in the browser
 * and the row crosses to its new section in the same frame.
 *
 * Nothing on this page applies to anything. Pemby records what the person did; the person applies.
 */
export function TrackerClient({ initial }: { initial: TrackerView }) {
  const t = useTranslations("Tracker");
  const tracker = useTracker(initial);
  const data = tracker.tracker;
  const introId = useId();
  // The row the person last moved. A stage change moves the row to a different section, so React
  // unmounts it and mounts a new one elsewhere on the page; this is how the new one knows it is the
  // same row and takes the focus and the viewport with it. See `TrackerRow`'s `justMoved`.
  const [movedJobId, setMovedJobId] = useState<string | null>(null);

  const { columns, off } = sort(data.rows);
  const actions: TrackerRowActions = {
    setState: (jobId, state) => {
      setMovedJobId(jobId);
      tracker.setState({ jobId, state });
    },
    reportLocation: (jobId) => tracker.reportLocation({ jobId }),
  };

  return (
    <div className={styles.layout} aria-busy={tracker.pending}>
      <header className={styles.intro}>
        <h1 id={introId} className={styles.title}>
          {t("title")}
        </h1>
        <p className={styles.lead}>{t("lead")}</p>
      </header>

      {tracker.error ? (
        <p className={styles.alert} role="alert">
          {t(`errors.${tracker.error}`)}
        </p>
      ) : null}

      {tracker.failed ? (
        <p className={styles.alert} role="alert">
          {t("failed")}{" "}
          <button type="button" className={styles.textAction} onClick={tracker.retry}>
            {t("retry")}
          </button>
        </p>
      ) : null}

      {data.rows.length === 0 ? (
        <section className={styles.empty} aria-labelledby={`${introId}-empty`}>
          <h2 id={`${introId}-empty`} className={styles.emptyTitle}>
            {t("empty.title")}
          </h2>
          <p className={styles.emptyBody}>{t("empty.body")}</p>
          <Link className={styles.emptyAction} href="/brief">
            {t("empty.cta")}
          </Link>
        </section>
      ) : (
        <div className={styles.board}>
          {TRACKER_COLUMNS.map((name) => (
            <TrackerColumn
              key={name}
              label={t(`columns.${name}`)}
              rows={columns.get(name) ?? []}
              actions={actions}
              hasCountry={data.country !== null}
              movedJobId={movedJobId}
            />
          ))}
          {off.length > 0 ? (
            <TrackerColumn
              label={t("off.title")}
              lead={t("off.lead")}
              rows={off}
              actions={actions}
              hasCountry={data.country !== null}
              movedJobId={movedJobId}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}
