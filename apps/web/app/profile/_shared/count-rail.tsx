"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { MatchCounter, useCountryName } from "@/components/profile";
import type { ProfileView } from "@/app/api/profile/_lib/view";
import type { MatchCount } from "./use-profile";
import panels from "./panels.module.css";
import styles from "./rail.module.css";

/**
 * The way out of the profile and into the roles it describes (PLAN D6). It sits under the count
 * because the count is what raises the question: "N roles hire from Moldova" is only worth reading
 * if the roles themselves are one tap away. Deliberately not behind the same flag as the count —
 * the doorway to the Brief is not a staging surface.
 */
export function BriefLink() {
  const t = useTranslations("Onboarding.profile");
  const settings = useTranslations("Settings");
  return (
    <div className={styles.brief}>
      <Link className={panels.primary} href="/brief">
        {t("briefCta")}
      </Link>
      <p className={styles.note}>{t("briefNote")}</p>
      {/* Phase 08: the other way out of the profile — where those roles are sent (PLAN D8). A quiet
          text link, not a second primary: the Brief is the one call on this rail. Its string lives
          in the Settings namespace with the rest of that surface's copy. */}
      <Link className={panels.textLink} href="/settings">
        {settings("railLink")}
      </Link>
    </div>
  );
}

/**
 * The live count (PLAN D5), through the same teaser interface the landing page uses. Green tier
 * only for an anonymous visitor, who has no profile to opt into yellow with; a signed-in caller
 * gets whatever their `include_yellow` says (PLAN D2, D13 amended 2026-09-17).
 *
 * Two lines, never one. "N roles hire from {country}" is a hard claim, and once the yellow opt-in
 * feeds the number it would be covering posts Pemby judges no more than likely. So the green count
 * keeps that sentence to itself and the yellow count gets its own, weaker one underneath; the
 * yellow line never borrows "hire from", and it is absent rather than zero when there is nothing
 * likely to report, because "0 more look likely" is noise, not an answer.
 *
 * Zero green is the ordinary case on real data, so the pair is written for it: with nothing green
 * the second line drops "more", which would otherwise be counting up from a number that is not
 * there, and names what it is counting instead.
 *
 * While a new number is being worked out the last one stays on screen and both lines go quiet, so
 * an edit never flashes a number that was never true; a count that has never been known shows the
 * dashed empty badge instead. Zero is a real answer and is written out as one.
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

  // Null only before the first answer arrives, which is the dashed-badge "checking" state.
  const green = result?.greenCount ?? null;
  const likely = result?.yellowCount ?? 0;
  const showLikely = likely > 0;

  const spoken = count.pending || green === null ? "" : announcement(t, green, likely, country);

  return (
    <div className={styles.line} aria-busy={count.pending}>
      {/* Keyed on both numbers so a settled change replays the one authored moment on this screen. */}
      <div key={`${green ?? "none"}/${likely}`} className={styles.settle}>
        {/* `country`, never a pre-built label: MatchCounter owns the sentence for every surface
            that shows this number, so onboarding and the landing teaser cannot drift apart. */}
        <MatchCounter
          as="h2"
          id={headingId}
          count={green}
          country={country}
          pending={count.pending}
        />
        {showLikely ? (
          <p className={styles.likely} data-pending={count.pending}>
            <span className={styles.likelyBadge}>{likely}</span>
            <span className={styles.likelyLabel}>
              {green === 0
                ? t("likelyOnly", { count: likely })
                : t("likelyMore", { count: likely })}
            </span>
          </p>
        ) : null}
      </div>
      {/* One note for both lines. The green-only sentence is the landing teaser's, so the two
          surfaces keep saying the same thing about the same number. */}
      <p className={styles.note}>
        {showLikely ? t("likelyNote") : teaser("counterNote", { country })}
      </p>
      <p className="visually-hidden" role="status" aria-live="polite">
        {spoken}
      </p>
    </div>
  );
}

/** Both lines in one utterance, so a screen reader hears the pair the way the page shows it. */
function announcement(
  t: ReturnType<typeof useTranslations<"Onboarding.counter">>,
  green: number,
  likely: number,
  country: string,
): string {
  const first = t("announce", { count: green, country });
  if (likely === 0) return first;
  const second =
    green === 0
      ? t("announceLikelyOnly", { count: likely })
      : t("announceLikelyMore", { count: likely });
  return `${first} ${second}`;
}
