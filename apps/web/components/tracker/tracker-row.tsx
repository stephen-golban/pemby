"use client";

import type { TrackerRowView } from "@/app/api/applications/_lib/view";
import { APPLICATION_STATES } from "@/app/api/applications/_lib/view";
import { ChoiceEditor, FieldRow } from "@/app/profile/_shared/fields";
import type { TrackerApplicationState } from "@pemby/core";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useRef } from "react";
import styles from "./tracker.module.css";

export interface TrackerRowActions {
  setState: (jobId: string, state: TrackerApplicationState) => void;
  reportLocation: (jobId: string) => void;
}

/**
 * Dates in UTC, deliberately.
 *
 * The page is server-rendered and then hydrated, and the server's zone is not the reader's. A
 * date formatted in local time therefore renders one string on the server and sometimes another in
 * the browser, which React reports as a hydration mismatch and which no amount of `useEffect`
 * makes honest. These are day-grain facts — when you applied, when the row last moved — so a fixed
 * zone costs at most a few hours at a boundary and buys markup that agrees with itself.
 */
function useDay(): (iso: string) => string {
  const locale = useLocale();
  return useMemo(() => {
    const format = new Intl.DateTimeFormat(locale, {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
    return (iso: string) => format.format(new Date(iso));
  }, [locale]);
}

/**
 * One job on the board.
 *
 * The row is the profile ledger's `FieldRow`, imported rather than rebuilt: an uppercase mono label
 * column holding the employer, the job itself in the value, a hairline under it, and one outline
 * pill that opens the stage picker **inside the row** — no modal, no drawer, no drag. The picker is
 * `ChoiceEditor`, the same radio group the profile uses, because the stages are few and worth
 * reading at once.
 *
 * **The picker offers `application_state` values; the board shows columns.** `interview` folds
 * screening and interviewing, so a control that offered the column would have to guess which of the
 * two the person meant. The summary is coarse on purpose; the record is not.
 *
 * `withdrawn` and `no answer` are in the picker and in no column. Picking one moves the row off the
 * board and into "Off the board" below it — which is a real answer, and better than a row that
 * vanishes.
 */
export function TrackerRow({
  row,
  actions,
  hasCountry,
  justMoved,
}: {
  row: TrackerRowView;
  actions: TrackerRowActions;
  /** False when the profile records no residence country: the report has no scope to file under. */
  hasCountry: boolean;
  /**
   * This row is the one the person just moved, and it has re-mounted in a different section.
   *
   * Changing a stage changes the row's column, and a column is a different parent, so React unmounts
   * the row and mounts a new one further down the page. Two things break when that happens and both
   * are fixed here rather than designed around:
   *
   * - **Focus is dropped on the floor.** The keyboard user's focus was on a radio inside an editor
   *   that no longer exists, so it falls back to `<body>` and the next Tab starts from the top of
   *   the document. The row's own control is where they were and where they should still be.
   * - **The confirmation can be off-screen.** On a phone, moving a row from Saved to Rejected sends
   *   it past four sections; the move *is* the feedback, and feedback nobody sees is none.
   *
   * The scroll is instant, not smooth: this is a state change being made visible, not an animation,
   * and DESIGN.md allows the page exactly one orchestrated motion, which is not this one.
   */
  justMoved: boolean;
}) {
  const t = useTranslations("Tracker");
  const day = useDay();
  const anchor = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!justMoved) return;
    anchor.current?.scrollIntoView({ block: "nearest", behavior: "auto" });
    // The row's own pill, not the first button in it: a rejected row carries the location button
    // ahead of the pill in the DOM. `aria-expanded` is the pill's, and only the pill's.
    anchor.current
      ?.closest("[data-filled]")
      ?.querySelector<HTMLElement>("button[aria-expanded]")
      ?.focus();
  }, [justMoved]);

  const meta =
    row.appliedAt === null
      ? t("row.savedNotApplied")
      : t("row.appliedOn", { date: day(row.appliedAt) });

  const job = (
    <div className={styles.job} ref={anchor}>
      {/* The employer's own form when the post names one, the post otherwise. Pemby never opens
          it for you and never submits anything: the tap is the person's. */}
      <a
        className={styles.title}
        href={row.applyUrl ?? row.url}
        target="_blank"
        rel="noopener noreferrer"
      >
        {row.title}
      </a>
      <p className={styles.meta}>
        {meta}
        {" · "}
        {t("row.lastChange", { date: day(row.updatedAt) })}
      </p>
      {row.demo ? <p className={styles.stamp}>{t("row.example")}</p> : null}
      {row.jobStatus === "open" ? null : (
        <p className={styles.status}>{t(`status.${row.jobStatus}`)}</p>
      )}
      {row.applicationState === "rejected" ? (
        <LocationQuestion row={row} onReport={actions.reportLocation} hasCountry={hasCountry} />
      ) : null}
    </div>
  );

  return (
    <FieldRow
      label={row.companyName}
      filled
      value={job}
      empty=""
      editor={() => (
        <div className={styles.job}>
          {job}
          <ChoiceEditor<TrackerApplicationState>
            legend={t("row.legend")}
            options={APPLICATION_STATES.map((state) => ({
              value: state,
              label: t(`states.${state}`),
            }))}
            value={row.applicationState}
            onChange={(next) => {
              if (next !== null) actions.setState(row.jobId, next);
            }}
          />
        </div>
      )}
    />
  );
}

/**
 * "Rejected because of my location?" — the one question on this page that changes what Pemby knows.
 *
 * It is asked in place, under the row it is about, and only on a rejection, because that is the
 * only moment the person has the answer. Saying yes writes eligibility evidence about the employer
 * scoped to the person's own country, which is why the help line says plainly what it does and that
 * it cannot be taken back, and why the button is the person's words rather than "Yes".
 */
function LocationQuestion({
  row,
  onReport,
  hasCountry,
}: {
  row: TrackerRowView;
  onReport: (jobId: string) => void;
  hasCountry: boolean;
}) {
  const t = useTranslations("Tracker");

  if (row.rejectedForLocation) {
    return (
      <p className={styles.locationDone}>
        <span className={styles.dot} aria-hidden="true" />
        {t("location.done")}
      </p>
    );
  }

  return (
    <div className={styles.location}>
      <p className={styles.locationQuestion}>{t("location.question")}</p>
      <p className={styles.locationHelp}>
        {hasCountry ? t("location.help") : t("location.noCountry")}
      </p>
      {hasCountry ? (
        <button type="button" className={styles.locationAction} onClick={() => onReport(row.jobId)}>
          {t("location.confirm")}
        </button>
      ) : null}
    </div>
  );
}
