"use client";

import type { TeaserJob, TeaserResult } from "@/lib/teaser";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { MatchCounter } from "./match-counter";
import styles from "./profile.module.css";

// Green reasons only: the teaser never shows another tier (phase 06 item 4).
const GREEN_REASONS = ["country-named", "worldwide-engagement", "company-names-country"] as const;
type GreenReason = (typeof GREEN_REASONS)[number];

function isGreenReason(key: string | null): key is GreenReason {
  return (GREEN_REASONS as readonly (string | null)[]).includes(key);
}

/** One green-tier job: role, company and place, the verdict with its words, and the reason. */
export function TeaserCard({ job, countryLabel }: { job: TeaserJob; countryLabel: string }) {
  const t = useTranslations("Cv.teaser");
  const params = { engagement: "", ...job.reasonParams, country: countryLabel };
  const reason = isGreenReason(job.reasonKey)
    ? t(`reasons.${job.reasonKey}`, params)
    : t("reasonFallback", { country: countryLabel });

  return (
    <li className={styles.job}>
      <div className={styles.jobMain}>
        <h4 className={styles.jobTitle}>{job.title}</h4>
        <p className={styles.jobMeta}>{[job.company, job.location].filter(Boolean).join(" · ")}</p>
        <p className={styles.verdict}>
          <span className={styles.swatch} aria-hidden="true" />
          {t("tier", { country: countryLabel })}
        </p>
        <p className={styles.reason}>{reason}</p>
      </div>
      <a
        className={styles.open}
        href={job.url}
        rel="noopener noreferrer nofollow"
        target="_blank"
        aria-label={t("openLabel", { title: job.title, company: job.company })}
      >
        {t("open")}
        <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <path
            d="M6 3.5h6.5V10M12.5 3.5 4 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </a>
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
        <MatchCounter
          as="h3"
          id={headingId}
          count={null}
          pending
          label={t("checking", { country })}
        />
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
        <MatchCounter as="h3" id={headingId} count={0} label={t("noneTitle", { country })} />
        <p className={styles.note}>{t("noneBody", { country })}</p>
      </>
    );
  } else {
    body = (
      <>
        <MatchCounter
          as="h3"
          id={headingId}
          count={result.count}
          label={t("count", { count: result.count, country })}
        />
        <p className={styles.note}>{t("sample", { shown: result.jobs.length })}</p>
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
