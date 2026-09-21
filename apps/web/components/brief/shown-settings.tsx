"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useId } from "react";
import type { PreferencesPatch } from "@/app/api/brief/_lib/view";
import styles from "./brief.module.css";

/**
 * The two settings that decide what reaches this page, as one quiet white card at the foot of it.
 *
 * They are the same two switches the near-miss fixes flip, on the same cache entry, so a tap either
 * place moves both. Having them here as well is what makes a fix reversible: a one-tap fix with no
 * visible off switch is a one-way door.
 *
 * Neither is a paid feature. The yellow opt-in moved to the free tier when PLAN D13 was amended on
 * 2026-09-17, so nothing here checks for a pass.
 */
export function ShownSettings({
  includeYellow,
  hideNoSalary,
  country,
  onChange,
  settingsLink,
}: {
  includeYellow: boolean;
  hideNoSalary: boolean;
  country: string;
  onChange: (patch: PreferencesPatch) => void;
  /** The label of the second quiet link, which lives in the Settings namespace with its surface. */
  settingsLink: string;
}) {
  const t = useTranslations("Brief");
  const titleId = useId();
  const yellowId = useId();
  const salaryId = useId();

  return (
    <section className={styles.settings} aria-labelledby={titleId}>
      <div className={styles.settingsHead}>
        <h2 id={titleId} className={styles.settingsTitle}>
          {t("rail.settings")}
        </h2>
        <p className={styles.settingsNote}>{t("rail.note")}</p>
      </div>

      <div className={styles.settingsList}>
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
            className={styles.switch}
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
            className={styles.switch}
            onClick={() => onChange({ hideNoSalary: !hideNoSalary })}
          >
            {hideNoSalary ? t("rail.off") : t("rail.on")}
          </button>
        </div>
      </div>

      <p className={styles.settingsLinks}>
        <Link className={styles.quietAction} href="/profile">
          {t("rail.profile")}
        </Link>
        {/* The second thing this card can send you to change — not what reaches you, but where it
            reaches you (PLAN D8). Its string lives in the Settings namespace with that surface. */}
        <Link className={`${styles.quietAction} ${styles.quietDivider}`} href="/settings">
          {settingsLink}
        </Link>
      </p>
    </section>
  );
}
