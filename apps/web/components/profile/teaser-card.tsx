"use client";

import type { TeaserJob, TeaserResult } from "@/lib/teaser";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { ArrowMark, TierMark } from "@/components/brief/marks";
import { MatchCounter } from "./match-counter";
import styles from "./profile.module.css";

// The three reason keys this surface has its own wording for. Phase 06 could stop there because
// the teaser was green-only; phase 07 lets a signed-in caller opt into yellow (PLAN D13 amended
// 2026-09-17), so anything else falls through to the sentence the engine already rendered rather
// than to a green-shaped one.
const GREEN_REASONS = ["country-named", "worldwide-engagement", "company-names-country"] as const;
type GreenReason = (typeof GREEN_REASONS)[number];

function isGreenReason(key: string | null): key is GreenReason {
  return (GREEN_REASONS as readonly (string | null)[]).includes(key);
}

/**
 * One job from the teaser: role, company and place, the verdict with its words, and the reason.
 *
 * The verdict is the post's own tier, never assumed green: a yellow post says "likely", because
 * labelling it "hires from {country}" would be the one thing this product must not get wrong
 * (PLAN D2). It is never colour alone — a solid tier tile carrying that tier's own marker, a
 * tinted tier pill, and the tier's words in it — which is the Brief's own grammar, so a post reads
 * the same here as it will there.
 */
export function TeaserCard({ job, countryLabel }: { job: TeaserJob; countryLabel: string }) {
  const t = useTranslations("Cv.teaser");
  const params = { engagement: "", ...job.reasonParams, country: countryLabel };
  const reason = isGreenReason(job.reasonKey)
    ? t(`reasons.${job.reasonKey}`, params)
    : // `job_eligibility.reason` is the English the engine already wrote; rows from before
      // migration 0008 carry no key, so it is the fallback rather than a generic line.
      (job.reasonText ?? "") || t(`reasonFallback.${job.tier}`, { country: countryLabel });

  return (
    <li className={styles.job}>
      {/* The tile carries the tier's own marker, so the verdict survives a reader who cannot tell
          the fills apart; the tinted pill beside the company says it in words. */}
      <span className={styles.jobTile} data-tier={job.tier}>
        <TierMark tier={job.tier} className={styles.jobMark} />
      </span>

      <div className={styles.jobMain}>
        <h4 className={styles.jobTitle}>{job.title}</h4>
        <p className={styles.jobMeta}>
          <span>{[job.company, job.location].filter(Boolean).join(" · ")}</span>
          <span className={styles.tierPill} data-tier={job.tier}>
            {t(`tier.${job.tier}`, { country: countryLabel })}
          </span>
        </p>
        <p className={styles.reason}>{reason}</p>
        <a
          className={styles.open}
          href={job.url}
          rel="noopener noreferrer nofollow"
          target="_blank"
          aria-label={t("openLabel", { title: job.title, company: job.company })}
        >
          {t("open")}
          <ArrowMark className={styles.openArrow} />
        </a>
      </div>
    </li>
  );
}

/**
 * The teaser block: the count as a MatchCounter, then up to three TeaserCards, or an honest line
 * when there is nothing to show. `countryLabel` is the localized country name. `footer` holds the
 * next action (sign up to save), so the block itself stays reusable.
 */
export function TeaserResults({
  state,
  result,
  countryLabel,
  headingId,
  onRetry,
  footer,
}: {
  state: "loading" | "error" | "ready";
  result: TeaserResult | undefined;
  countryLabel: string | null;
  headingId: string;
  onRetry: () => void;
  footer?: ReactNode;
}) {
  const t = useTranslations("Cv.teaser");
  const country = countryLabel ?? t("yourCountry");

  let body: ReactNode;
  if (state === "loading" || !result) {
    body =
      state === "error" ? (
        <>
          <h3 id={headingId} className={styles.quietTitle}>
            {t("failed")}
          </h3>
          <button type="button" className={styles.pill} onClick={onRetry}>
            {t("retry")}
          </button>
        </>
      ) : (
        <MatchCounter as="h3" id={headingId} count={null} country={country} pending />
      );
  } else if (result.basis === "no_country") {
    body = (
      <>
        <h3 id={headingId} className={styles.quietTitle}>
          {t("noCountryTitle")}
        </h3>
        <p className={styles.note}>{t("noCountryBody")}</p>
      </>
    );
  } else if (result.basis === "unsupported_country" || result.count === null) {
    body = (
      <>
        <h3 id={headingId} className={styles.quietTitle}>
          {t("unsupportedTitle", { country })}
        </h3>
        <p className={styles.note}>{t("unsupportedBody", { country })}</p>
      </>
    );
  } else if (result.count === 0 || result.jobs.length === 0) {
    body = (
      <>
        <MatchCounter as="h3" id={headingId} count={0} country={country} />
        <p className={styles.note}>{t("counterNote", { country })}</p>
        <p className={styles.note}>{t("noneBody")}</p>
      </>
    );
  } else {
    body = (
      <>
        <MatchCounter as="h3" id={headingId} count={result.count} country={country} />
        <p className={styles.note}>
          {t("sample", { shown: result.jobs.length })} {t("counterNote", { country })}
        </p>
        <ul className={styles.jobs}>
          {result.jobs.map((job) => (
            <TeaserCard key={job.id} job={job} countryLabel={country} />
          ))}
        </ul>
      </>
    );
  }

  return (
    <section className={styles.teaser} aria-labelledby={headingId} aria-busy={state === "loading"}>
      {body}
      {footer}
    </section>
  );
}
