"use client";

import { useTranslations } from "next-intl";
import { MatchCounter, useCountryName } from "@/components/profile";
import type { ProfileView } from "@/app/api/profile/_lib/view";
import type { MatchCount } from "./use-profile";
import styles from "./rail.module.css";

/**
 * The live count (PLAN D5), through the same teaser interface the landing page uses and therefore
 * green tier only — never yellow, for anonymous or free users.
 *
 * While a new number is being worked out the last one stays on screen and the whole line goes
 * quiet, so an edit never flashes a number that was never true; a count that has never been known
 * shows the dashed empty badge instead. Zero is a real answer and is written out as one.
 */
export function MatchCountLine({
  profile,
  count,
  headingId,
}: {
  profile: ProfileView;
  count: MatchCount;
  headingId: string;
}) {
  const t = useTranslations("Onboarding.counter");
  const teaser = useTranslations("Cv.teaser");
  const countryName = useCountryName();

  const country =
    countryName(count.result?.country ?? profile.residenceCountry) ?? teaser("yourCountry");
  const result = count.result;

  if (profile.residenceCountry === null) {
    return (
      <div className={styles.line}>
        <h2 id={headingId} className={styles.quiet}>
          {t("noCountryTitle")}
        </h2>
        <p className={styles.note}>{t("noCountryBody")}</p>
      </div>
    );
  }

  if (count.failed) {
    return (
      <div className={styles.line}>
        <h2 id={headingId} className={styles.quiet}>
          {t("failed")}
        </h2>
        <button type="button" className={styles.pill} onClick={count.retry}>
          {teaser("retry")}
        </button>
      </div>
    );
  }

  if (result && (result.basis === "unsupported_country" || result.count === null)) {
    return (
      <div className={styles.line}>
        <h2 id={headingId} className={styles.quiet}>
          {t("unsupportedTitle", { country })}
        </h2>
        <p className={styles.note}>{t("unsupportedBody", { country })}</p>
      </div>
    );
  }

  const value = result?.count ?? null;
  return (
    <div className={styles.line} aria-busy={count.pending}>
      {/* Keyed on the number so a settled change replays the one authored moment on this screen. */}
      <div key={value ?? "none"} className={styles.settle}>
        <MatchCounter
          as="h2"
          id={headingId}
          count={value}
          pending={count.pending}
          label={
            value === null
              ? teaser("checking", { country })
              : teaser("count", { count: value, country })
          }
        />
      </div>
      <p className={styles.note}>{t("note", { country })}</p>
      <p className="visually-hidden" role="status" aria-live="polite">
        {count.pending || value === null ? "" : t("announce", { count: value, country })}
      </p>
    </div>
  );
}
