"use client";

import { useTranslations } from "next-intl";
import {
  PROFILE_STRENGTH_WEIGHTS,
  profileGaps,
  profileStrength,
  type ProfileView,
} from "@/app/api/profile/_lib/view";
import { fieldAnchor } from "./rows";
import styles from "./panels.module.css";

/**
 * Profile strength: one number for how much of what the matcher reads has been answered, and a
 * list of what would add the most.
 *
 * The formula and the reasoning behind every weight live next to the fields they score, in
 * `app/api/profile/_lib/view.ts` (`PROFILE_STRENGTH_WEIGHTS`, `profileFieldScore`,
 * `profileStrength`). It is derived, never stored, so the number moves in the same frame as an
 * optimistic edit.
 *
 * The number and the bar only exist while something is missing. Once everything the matcher reads
 * is answered there is no distance left to measure, so a 100% and a full bar would be three ways of
 * saying one thing; one sentence says it once. The bar is `aria-hidden` while it shows: the
 * percentage beside it is the accessible value and the gap list below it is the accessible detail,
 * so there is nothing a progressbar role would add.
 */
export function StrengthMeter({ profile }: { profile: ProfileView }) {
  const t = useTranslations("Onboarding.strength");
  const fields = useTranslations("Onboarding.fields");
  const gaps = profileGaps(profile);
  const percent = profileStrength(profile);

  return (
    <section
      id="profile-strength"
      className={styles.panel}
      aria-labelledby="profile-strength-title"
    >
      <h2 id="profile-strength-title" className={styles.panelTitle}>
        {t("title")}
      </h2>
      {gaps.length === 0 ? (
        <p className={styles.settled}>{t("complete")}</p>
      ) : (
        <>
          <p className={styles.metric}>{t("percent", { percent })}</p>
          <div className={styles.track} aria-hidden="true">
            <div className={styles.fill} style={{ inlineSize: `${percent}%` }} />
          </div>
          <p className={styles.note}>{t("gapsLead", { count: gaps.length })}</p>
          <ul className={styles.gaps}>
            {gaps.map((key) => (
              <li key={key}>
                <a className={styles.gapPill} href={`#${fieldAnchor(key)}`}>
                  {fields(key)}
                  <span className={styles.gapWeight}>
                    {t("weight", { points: PROFILE_STRENGTH_WEIGHTS[key] })}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
