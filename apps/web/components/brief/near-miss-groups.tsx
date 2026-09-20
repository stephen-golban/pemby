"use client";

import { useTranslations } from "next-intl";
import type { CSSProperties } from "react";
import { MIN_SCORE_FLOOR } from "@/app/api/brief/_lib/view";
import type { NearMissGroupView, PreferencesPatch } from "@/app/api/brief/_lib/view";
import styles from "./brief.module.css";

/** The settings a fix may flip, as the page currently has them. */
export interface FixState {
  includeYellow: boolean;
  hideNoSalary: boolean;
  /** `profiles.score_floor`; null means the configured threshold. */
  scoreFloor: number | null;
}

type FixKind = "yellow" | "salary" | "score";

/**
 * Which setting, if any, opens one group — and how many posts it would actually let through.
 *
 * Three groups have a one-tap fix, because three of them are blocked by a choice the reader made
 * rather than by the post itself. Every one of them is offered against the number the tap
 * **delivers**, never the size of the group it sits under:
 *
 *  - **yellow** against `yellowCount`. Posts that are unclear or excluded never reach this page at
 *    all (PLAN D2), and anything else in an `eligibility` group was blocked by something the yellow
 *    setting does not touch.
 *  - **salary** against `count`. Every post in a `salary_missing` group is one the setting hides,
 *    so here the group and the delivery are the same number.
 *  - **score** against `atFloorCount`. Dropping the bar to its floor opens only the rows already
 *    scoring at or above it; the read counts them from their own scores rather than assuming the
 *    band starts there.
 *
 * The score fix is offered only while the bar is above its floor. Once it is at the floor the group
 * that is left is the part no bar can reach, and offering a tap that moves nothing is the same
 * over-promise in a different place.
 */
function fixFor(
  group: NearMissGroupView,
  state: FixState,
): { patch: PreferencesPatch; count: number; kind: FixKind } | null {
  if (group.blocker === "eligibility" && !state.includeYellow && group.yellowCount > 0) {
    return { patch: { includeYellow: true }, count: group.yellowCount, kind: "yellow" };
  }
  if (group.blocker === "salary_missing" && state.hideNoSalary) {
    return { patch: { hideNoSalary: false }, count: group.count, kind: "salary" };
  }
  if (group.blocker === "score" && state.scoreFloor !== MIN_SCORE_FLOOR && group.atFloorCount > 0) {
    return { patch: { scoreFloor: MIN_SCORE_FLOOR }, count: group.atFloorCount, kind: "score" };
  }
  return null;
}

/**
 * Near misses grouped by the one gate that blocked them (PLAN D7): a count badge, the group's
 * name, the one-tap fix where there is one, and the posts' own names as job chips underneath —
 * the ledger DESIGN.md specifies for this exact block.
 *
 * A fix flips a profile setting; it does not conjure the posts into this page. Pemby re-matches
 * on a profile change, so the copy after a tap says when they arrive instead of pretending they
 * already have.
 */
export function NearMissGroups({
  groups,
  state,
  onFix,
  settle,
}: {
  groups: readonly NearMissGroupView[];
  state: FixState;
  onFix: (patch: PreferencesPatch) => void;
  /** Plays the one authored moment on this page when the Brief is silent. */
  settle?: boolean;
}) {
  const t = useTranslations("Brief");

  return (
    <ul className={styles.groups} aria-label={t("nearMiss.groupLabel")} data-settle={settle}>
      {groups.map((group, index) => {
        const fix = fixFor(group, state);
        const done =
          group.blocker === "eligibility" && state.includeYellow
            ? t("nearMiss.fixYellowDone")
            : group.blocker === "salary_missing" && !state.hideNoSalary
              ? t("nearMiss.fixSalaryDone")
              : // The score bar is at its floor and rows are still here: they are under the floor,
                // not under a setting, so this says the bar is spent rather than offering a tap.
                group.blocker === "score" && state.scoreFloor === MIN_SCORE_FLOOR
                ? t("nearMiss.fixScoreDone")
                : null;
        const hidden = Math.max(0, group.count - group.examples.length);

        return (
          <li
            key={group.blocker ?? "unknown"}
            className={styles.group}
            style={{ "--settle-index": index } as CSSProperties}
          >
            <div className={styles.groupHead}>
              <span className={styles.badge} aria-hidden="true">
                {group.count}
              </span>
              <h3 className={styles.groupName}>
                {group.blocker === null
                  ? t("nearMiss.groups.unknown")
                  : t(`nearMiss.groups.${group.blocker}`)}
                <span className="visually-hidden">
                  {" "}
                  {t("nearMiss.count", { count: group.count })}
                </span>
              </h3>
              {fix ? (
                <button type="button" className={styles.pill} onClick={() => onFix(fix.patch)}>
                  {fix.kind === "yellow"
                    ? t("nearMiss.fixYellow", { count: fix.count })
                    : fix.kind === "salary"
                      ? t("nearMiss.fixSalary", { count: fix.count })
                      : t("nearMiss.fixScore", { count: fix.count })}
                </button>
              ) : null}
            </div>

            {/* This note replaces the fix button once the setting is on, so it announces
                itself rather than leaving a screen reader with a control that vanished. */}
            {done ? (
              <p className={styles.groupNote} role="status">
                {done}
              </p>
            ) : null}
            {!fix && !done ? <p className={styles.groupNote}>{t("nearMiss.noFix")}</p> : null}

            <ul className={styles.chips}>
              {group.examples.map((example) => (
                <li key={example.jobId} className={styles.chip}>
                  {example.title}
                  <span className={styles.chipDetail}>{example.company}</span>
                  {/* A seeded post sits beside real ones in this list, so it carries the stamp
                      here too: every invented role is marked where it cannot be missed
                      (DESIGN.md, "EXAMPLE stamp"). */}
                  {example.demo ? (
                    <span className={styles.chipStamp}>{t("match.example")}</span>
                  ) : null}
                </li>
              ))}
              {hidden > 0 ? (
                <li className={styles.chipMore}>{t("nearMiss.more", { count: hidden })}</li>
              ) : null}
            </ul>
          </li>
        );
      })}
    </ul>
  );
}
