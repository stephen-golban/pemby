"use client";

import type { EligibilityTier } from "@pemby/core";
import { useTranslations } from "next-intl";
import styles from "./brief.module.css";

/**
 * The eligibility verdict: a colour swatch **and** its words, never the colour alone (DESIGN.md,
 * "The Label Beside Every Colour Rule"; PLAN D2). The swatch is decorative — every reader gets the
 * same sentence whether or not they can see it.
 */
export function TierVerdict({ tier, country }: { tier: EligibilityTier; country: string }) {
  const t = useTranslations("Brief");
  return (
    <p className={styles.verdict}>
      <span className={styles.swatch} data-tier={tier} aria-hidden="true" />
      {t(`tier.${tier}`, { country })}
    </p>
  );
}
