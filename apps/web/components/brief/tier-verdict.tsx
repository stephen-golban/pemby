"use client";

import type { EligibilityTier } from "@pemby/core";
import { useTranslations } from "next-intl";
import { LEGEND_TIERS, TierMark } from "./marks";
import styles from "./brief.module.css";

/**
 * The eligibility verdict is never colour alone (PLAN D2): it is a solid tier-coloured tile
 * carrying that tier's own marker, plus a tinted pill carrying the tier's words. Either half alone
 * would be a colour code; together they say the same thing three ways — shape, fill and sentence.
 *
 * Red is a blocker colour in this world and never a verdict: posts that rule your country out never
 * reach this page at all, so nothing here is ever drawn in it.
 */

/** The solid accent rounded square at the head of a match card. */
export function TierTile({ tier }: { tier: EligibilityTier }) {
  return (
    <span className={styles.tierTile} data-tier={tier}>
      <TierMark tier={tier} className={styles.tierTileMark} />
    </span>
  );
}

/** The tinted pill that says the verdict in words, inline beside the company. */
export function TierPill({ tier, country }: { tier: EligibilityTier; country: string }) {
  const t = useTranslations("Brief");
  return (
    <span className={styles.tierPill} data-tier={tier}>
      {t(`tier.${tier}`, { country })}
    </span>
  );
}

/**
 * The permanent legend at the foot of the page: every tier a reader can meet, its marker and its
 * word, in the order the page teaches them. It stays whether or not today has matches, so the
 * vocabulary is learnable on a silent day too.
 */
export function TierLegend({ country }: { country: string }) {
  const t = useTranslations("Brief");
  return (
    <ul className={styles.legend} aria-label={t("tier.label")}>
      {LEGEND_TIERS.map((tier) => (
        <li key={tier} className={styles.legendItem}>
          <span className={styles.legendTile} data-tier={tier}>
            <TierMark tier={tier} className={styles.legendMark} />
          </span>
          {t(`tier.${tier}`, { country })}
        </li>
      ))}
    </ul>
  );
}
