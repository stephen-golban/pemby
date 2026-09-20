"use client";

import { useTranslations } from "next-intl";
import { useId } from "react";
import { MIN_SCORE_FLOOR } from "@/app/api/brief/_lib/view";
import type { PreferencesPatch } from "@/app/api/brief/_lib/view";
import styles from "./brief.module.css";

/**
 * The three settings that decide what reaches this page, as a small ledger in the rail.
 *
 * They are the same three switches the near-miss fixes flip, on the same cache entry, so a tap
 * either place moves both. Having them here as well is what makes each fix reversible: a one-tap
 * fix with no visible off switch is a one-way door.
 *
 * None of them is a paid feature. The yellow opt-in moved to the free tier when PLAN D13 was
 * amended on 2026-09-17, and the score bar is one person's own view of their own Brief.
 *
 * The score row names no number, in either position. "Pemby's bar" is private config and this app
 * is never told it; the floor is a repo constant but printing it would put a scoring value on a
 * page for no gain, when what the reader needs to know is which of the two bars is in force.
 */
export function ShownSettings({
  includeYellow,
  hideNoSalary,
  scoreFloor,
  country,
  onChange,
}: {
  includeYellow: boolean;
  hideNoSalary: boolean;
  /** `profiles.score_floor`; null means the configured threshold. */
  scoreFloor: number | null;
  country: string;
  onChange: (patch: PreferencesPatch) => void;
}) {
  const t = useTranslations("Brief");
  const yellowId = useId();
  const salaryId = useId();
  const scoreId = useId();
  const lowered = scoreFloor === MIN_SCORE_FLOOR;

  return (
    <div className={styles.settings}>
      <h2 className={styles.settingsTitle}>{t("rail.settings")}</h2>

      <div className={styles.setting}>
        <div className={styles.settingText}>
          <p id={yellowId} className={styles.settingName}>
            {t("rail.yellow")}
          </p>
          <p className={styles.settingHelp}>{t("rail.yellowHelp", { country })}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={includeYellow}
          aria-labelledby={yellowId}
          className={styles.pill}
          onClick={() => onChange({ includeYellow: !includeYellow })}
        >
          {includeYellow ? t("rail.on") : t("rail.off")}
        </button>
      </div>

      <div className={styles.setting}>
        <div className={styles.settingText}>
          <p id={salaryId} className={styles.settingName}>
            {t("rail.salary")}
          </p>
          <p className={styles.settingHelp}>{t("rail.salaryHelp")}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={!hideNoSalary}
          aria-labelledby={salaryId}
          className={styles.pill}
          onClick={() => onChange({ hideNoSalary: !hideNoSalary })}
        >
          {hideNoSalary ? t("rail.off") : t("rail.on")}
        </button>
      </div>

      <div className={styles.setting}>
        <div className={styles.settingText}>
          <p id={scoreId} className={styles.settingName}>
            {t("rail.score")}
          </p>
          <p className={styles.settingHelp}>{t("rail.scoreHelp")}</p>
        </div>
        {/*
          Off is `null`, not a number: turning the bar back up hands the decision to the configured
          threshold rather than pinning today's value into the row, so a later change to that
          threshold still reaches everyone who never touched this.
        */}
        <button
          type="button"
          role="switch"
          aria-checked={lowered}
          aria-labelledby={scoreId}
          className={styles.pill}
          onClick={() => onChange({ scoreFloor: lowered ? null : MIN_SCORE_FLOOR })}
        >
          {lowered ? t("rail.scoreLowered") : t("rail.scoreDefault")}
        </button>
      </div>
    </div>
  );
}
