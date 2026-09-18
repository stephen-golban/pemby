"use client";

import { useTranslations } from "next-intl";
import type { CSSProperties } from "react";
import type { NearMissGroupView, PreferencesPatch } from "@/app/api/brief/_lib/view";
import styles from "./brief.module.css";

/**
 * Which setting, if any, opens one group — and how many posts it would actually let through.
 *
 * Only two groups have a one-tap fix, because only two of them are blocked by a choice the reader
 * made rather than by the post itself. The yellow fix is offered against `yellowCount` rather than
 * the whole group: posts that are unclear or excluded never reach this page at all (PLAN D2), and
 * anything else in an `eligibility` group was blocked by something the yellow setting does not
 * touch, so counting it would promise posts the tap cannot deliver.
 */
function fixFor(
  group: NearMissGroupView,
  includeYellow: boolean,
  hideNoSalary: boolean,
): { patch: PreferencesPatch; count: number; kind: "yellow" | "salary" } | null {
  if (group.blocker === "eligibility" && !includeYellow && group.yellowCount > 0) {
    return { patch: { includeYellow: true }, count: group.yellowCount, kind: "yellow" };
  }
  if (group.blocker === "salary_missing" && hideNoSalary) {
    return { patch: { hideNoSalary: false }, count: group.count, kind: "salary" };
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
  includeYellow,
  hideNoSalary,
  onFix,
  settle,
}: {
  groups: readonly NearMissGroupView[];
  includeYellow: boolean;
  hideNoSalary: boolean;
  onFix: (patch: PreferencesPatch) => void;
  /** Plays the one authored moment on this page when the Brief is silent. */
  settle?: boolean;
}) {
  const t = useTranslations("Brief");

  return (
    <ul className={styles.groups} aria-label={t("nearMiss.groupLabel")} data-settle={settle}>
      {groups.map((group, index) => {
        const fix = fixFor(group, includeYellow, hideNoSalary);
        const done =
          group.blocker === "eligibility" && includeYellow
            ? t("nearMiss.fixYellowDone")
            : group.blocker === "salary_missing" && !hideNoSalary
              ? t("nearMiss.fixSalaryDone")
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
                    : t("nearMiss.fixSalary", { count: fix.count })}
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
