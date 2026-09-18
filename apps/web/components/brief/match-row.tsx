"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import type { BriefMatchView, MatchState, PassReason } from "@/app/api/brief/_lib/view";
import { FlagPicker, type FlagChoice } from "./flag-picker";
import { useReasonText } from "./reasons";
import { PassPicker } from "./pass-picker";
import { TierVerdict } from "./tier-verdict";
import styles from "./brief.module.css";

export interface MatchActions {
  setState: (matchId: string, state: MatchState, passReason?: PassReason) => void;
  flag: (jobId: string, choice: FlagChoice) => void;
}

/**
 * One match, as a hairline-ruled ledger row (DESIGN.md: the Brief is a ledger, not a wall of
 * cards, and app rows never tilt).
 *
 * Reading order is the order the decision is made in: the role, then who can hire you and why,
 * then how recently the post was seen live, then what fits and the one thing that does not, then
 * the four actions. The eligibility reason leads because it is the only line that answers "can
 * this company actually pay me where I live".
 *
 * Every action is one tap and every one of them is optimistic: `use-brief.ts` writes the cache
 * first and restores it on failure.
 */
export function MatchRow({
  match,
  country,
  now,
  actions,
  pending,
}: {
  match: BriefMatchView;
  country: string;
  /** Rendered once by the client so every row agrees on "3h ago" and the server markup matches. */
  now: number;
  actions: MatchActions;
  pending: boolean;
}) {
  const t = useTranslations("Brief");
  const reason = useReasonText();
  const [open, setOpen] = useState<"none" | "pass" | "flag">("none");

  const eligibility = reason.eligibility(match.eligibility, country);
  // Reason keys render through i18n; a row from before migration 0009 falls back to the English
  // the matcher stored. A bullet with neither is dropped rather than shown blank.
  const reasons = match.reasons
    .map((view) => reason.score(view))
    .filter((line): line is string => line !== null && line !== "");
  const gap = match.gap === null ? null : reason.score(match.gap);
  const meta =
    match.location === null
      ? t("match.metaNoLocation", { company: match.company })
      : match.otherLocations > 0
        ? t("match.metaMore", {
            company: match.company,
            location: match.location,
            count: match.otherLocations,
          })
        : t("match.meta", { company: match.company, location: match.location });

  return (
    <li className={styles.row} data-state={match.state} data-pending={pending}>
      <div className={styles.head}>
        <div className={styles.headMain}>
          <h3 className={styles.name}>{match.title}</h3>
          <p className={styles.meta}>{meta}</p>
        </div>
        {/* The score is evidence, not a headline: mono, tabular, and read out in full to
            screen readers rather than left as a bare number. */}
        <p className={styles.score}>
          <span aria-hidden="true">{t("match.score", { score: match.score })}</span>
          <span className="visually-hidden">{t("match.scoreLabel", { score: match.score })}</span>
        </p>
      </div>

      {match.demo ? <p className={styles.stamp}>{t("match.example")}</p> : null}

      <TierVerdict tier={match.tier} country={country} />
      {eligibility ? <p className={styles.reason}>{eligibility}</p> : null}
      <p className={styles.verified}>{reason.freshness(match.lastVerifiedLiveAt, now)}</p>

      {reasons.length > 0 ? (
        <>
          <p className={styles.groupLabel}>{t("match.reasonsLabel")}</p>
          <ul className={styles.points}>
            {reasons.map((line, index) => (
              // Keyed by position: two bullets can render the same sentence, and the list is
              // rebuilt whole on every read of the Brief.
              <li key={index} className={styles.point}>
                {line}
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {gap ? (
        <p className={styles.gap}>
          <span className={styles.gapLabel}>{t("match.gapLabel")}</span>
          {gap}
        </p>
      ) : null}

      {match.wayOfWorking ? <p className={styles.way}>{t(`way.${match.wayOfWorking}`)}</p> : null}

      {match.state === "passed" && match.passReason ? (
        <p className={styles.settled}>
          {t("match.passed", { reason: t(`pass.reasons.${match.passReason}`) })}
        </p>
      ) : null}

      <div className={styles.actions}>
        {/* A real link, so the browser opens the post itself. Pemby records that you applied; it
            never applies for you (PLAN D9, D16). */}
        <a
          className={styles.apply}
          href={match.url}
          target="_blank"
          rel="noopener noreferrer nofollow"
          aria-label={t("match.applyLabel", { title: match.title, company: match.company })}
          onClick={() => actions.setState(match.matchId, "applied")}
        >
          {match.state === "applied" ? t("match.reopen") : t("match.apply")}
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

        <button
          type="button"
          className={styles.pill}
          aria-pressed={match.state === "saved"}
          onClick={() => actions.setState(match.matchId, match.state === "saved" ? "new" : "saved")}
        >
          {match.state === "saved" ? t("match.saved") : t("match.save")}
        </button>

        {match.state === "passed" ? null : (
          <button
            type="button"
            className={styles.pill}
            aria-expanded={open === "pass"}
            onClick={() => setOpen(open === "pass" ? "none" : "pass")}
          >
            {t("match.notForMe")}
          </button>
        )}

        {/* `aria-disabled`, not `disabled`: reporting a post is the action most likely to be
            taken from the keyboard, and a real `disabled` on the button that was just pressed
            takes it out of the tab order with focus still on it, dropping the reader. */}
        <button
          type="button"
          className={styles.pill}
          aria-expanded={match.flagged ? undefined : open === "flag"}
          aria-disabled={match.flagged || undefined}
          onClick={() => {
            if (match.flagged) return;
            setOpen(open === "flag" ? "none" : "flag");
          }}
        >
          {match.flagged ? t("match.flagged") : t("match.flag")}
        </button>
      </div>

      {open === "pass" ? (
        <PassPicker
          onClose={() => setOpen("none")}
          onPick={(passReason) => {
            setOpen("none");
            actions.setState(match.matchId, "passed", passReason);
          }}
        />
      ) : null}

      {open === "flag" ? (
        <FlagPicker
          stack={match.stack}
          locations={match.locations}
          onClose={() => setOpen("none")}
          onPick={(choice) => {
            setOpen("none");
            actions.flag(match.jobId, choice);
          }}
        />
      ) : null}
    </li>
  );
}
