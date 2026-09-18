"use client";

import { useTranslations } from "next-intl";
import { useId } from "react";
import type { PreferencesPatch } from "@/app/api/brief/_lib/view";
import styles from "./brief.module.css";

/**
 * The two settings that decide what reaches this page, as a small ledger in the rail.
 *
 * They are the same two switches the near-miss fixes flip, on the same cache entry, so a tap
 * either place moves both. Having them here as well is what makes the fix reversible: a one-tap
 * fix with no visible off switch is a one-way door.
 *
 * Neither is a paid feature. The yellow opt-in moved to the free tier when PLAN D13 was amended on
 * 2026-09-17, so nothing here checks for a pass.
 */
export function ShownSettings({
  includeYellow,
  hideNoSalary,
  country,
  onChange,
}: {
  includeYellow: boolean;
  hideNoSalary: boolean;
  country: string;
  onChange: (patch: PreferencesPatch) => void;
}) {
  const t = useTranslations("Brief");
  const yellowId = useId();
  const salaryId = useId();

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
    </div>
  );
}
