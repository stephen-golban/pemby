"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import styles from "./profile.module.css";

/**
 * "12 roles hire from Moldova": the count badge from DESIGN.md (ink pill, ground numerals, tabular
 * figures) leading a grotesk line. It owns the counter sentence for every surface that shows this
 * number, so the wording cannot drift between the teaser and onboarding: a real count reads
 * "N roles hire from {country}", zero reads "0 roles from {country} right now" (a count of zero is
 * an answer, not a smaller number), and a count still being worked out shows a dashed empty badge.
 *
 * `label` overrides the sentence for a state that is neither (the teaser's "checking" line).
 * `as` sets the element, so the landing can make it a heading. The onboarding counter passes an
 * optimistic `count`; the badge keeps its width steady with tabular numerals.
 */
export function MatchCounter({
  count,
  country,
  label,
  pending = false,
  as: Tag = "p",
  id,
}: {
  count: number | null;
  /** Localized country name; used by the built-in sentence. */
  country?: string;
  label?: ReactNode;
  pending?: boolean;
  as?: "p" | "h2" | "h3";
  id?: string;
}) {
  const t = useTranslations("Cv.teaser");
  const place = country ?? t("yourCountry");
  const sentence =
    label ??
    (count === null
      ? t("checking", { country: place })
      : count === 0
        ? t("noneTitle", { country: place })
        : t("count", { count, country: place }));

  return (
    <Tag className={styles.counter} id={id} data-pending={pending}>
      <span className={styles.badge} data-empty={count === null}>
        {count === null ? null : count}
      </span>
      <span className={styles.counterLabel}>{sentence}</span>
    </Tag>
  );
}
