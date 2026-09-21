"use client";

import { useTranslations } from "next-intl";
import { useState, type CSSProperties } from "react";
import type { BriefMatchView, MatchState, PassReason } from "@/app/api/brief/_lib/view";
import { FlagPicker, type FlagChoice } from "./flag-picker";
import { ArrowMark } from "./marks";
import { PassPicker } from "./pass-picker";
import { useReasonText } from "./reasons";
import { TierPill, TierTile } from "./tier-verdict";
import styles from "./brief.module.css";

export interface MatchActions {
  setState: (matchId: string, state: MatchState, passReason?: PassReason) => void;
  flag: (jobId: string, choice: FlagChoice) => void;
}

/**
 * One match, as a white card at 24px radius with a soft wide shadow, read from left to right.
 *
 * The far left carries the tier's own marker on a solid tier-coloured tile, so the verdict is
 * legible before a word is read and still legible to someone who cannot tell the fills apart. The
 * middle is the decision: the role, who it is with, the verdict in words, why it fits, and the one
 * thing it is short. The right end is the act: the score, then Apply, then the two quiet ways of
 * saying no.
 *
 * Every action is one tap and every one of them is optimistic: `use-brief.ts` writes the cache
 * first and restores it on failure.
 */
export function MatchCard({
  match,
  country,
  now,
  actions,
  pending,
  index = 0,
}: {
  match: BriefMatchView;
  country: string;
  /** Rendered once by the client so every card agrees on "3h ago" and the server markup matches. */
  now: number;
  actions: MatchActions;
  pending: boolean;
  /** Position in the stack, so the cards settle one after another rather than all at once. */
  index?: number;
}) {
  const t = useTranslations("Brief");
  const reason = useReasonText();
  const [open, setOpen] = useState<"none" | "pass" | "flag">("none");

  const eligibility = reason.eligibility(match.eligibility, country);
  // Reason keys render through i18n; a row from before migration 0009 falls back to the English
  // the matcher stored. A tag with neither is dropped rather than shown blank.
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
    <li
      className={styles.card}
      data-state={match.state}
      data-pending={pending}
      style={{ "--settle-index": index } as CSSProperties}
    >
      <TierTile tier={match.tier} />

      {/* The title is its own grid child so that on a narrow screen it can stay beside the tile
          while everything under it takes the full width of the card. */}
      <h3 className={styles.name}>{match.title}</h3>

      <div className={styles.body}>
        <p className={styles.meta}>
          <span className={styles.company}>{meta}</span>
          <TierPill tier={match.tier} country={country} />
          {match.demo ? <span className={styles.stamp}>{t("match.example")}</span> : null}
        </p>

        {eligibility ? <p className={styles.reason}>{eligibility}</p> : null}

        {reasons.length > 0 ? (
          <ul className={styles.tags} aria-label={t("match.reasonsLabel")}>
            {reasons.map((line, position) => (
              // Keyed by position: two tags can carry the same sentence, and the list is rebuilt
              // whole on every read of the Brief.
              <li key={position} className={styles.tag}>
                {line}
              </li>
            ))}
          </ul>
        ) : null}

        {gap ? (
          <p className={styles.gap}>
            <span className={styles.gapLabel}>{t("match.gapLabel")}</span>
            {gap}
          </p>
        ) : null}

        {match.state === "passed" && match.passReason ? (
          <p className={styles.settled}>
            {t("match.passed", { reason: t(`pass.reasons.${match.passReason}`) })}
          </p>
        ) : null}
      </div>

      <div className={styles.aside}>
        <p className={styles.score}>
          <span className={styles.scoreValue} aria-hidden="true">
            {t("match.score", { score: match.score })}
          </span>
          {/* The comp labels this number "match", which names nothing. It is a score, and it is
              read out in full to a screen reader rather than left as a bare numeral. */}
          <span className={styles.scoreUnit} aria-hidden="true">
            {t("match.scoreUnit")}
          </span>
          <span className="visually-hidden">{t("match.scoreLabel", { score: match.score })}</span>
        </p>

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
          <ArrowMark className={styles.applyArrow} />
        </a>

        <p className={styles.quietRow}>
          <button
            type="button"
            className={styles.quietAction}
            aria-pressed={match.state === "saved"}
            onClick={() =>
              actions.setState(match.matchId, match.state === "saved" ? "new" : "saved")
            }
          >
            {match.state === "saved" ? t("match.saved") : t("match.save")}
          </button>
          {match.state === "passed" ? null : (
            <button
              type="button"
              className={`${styles.quietAction} ${styles.quietDivider}`}
              aria-expanded={open === "pass"}
              onClick={() => setOpen(open === "pass" ? "none" : "pass")}
            >
              {t("match.notForMe")}
            </button>
          )}
        </p>
      </div>

      {/*
        The foot line is a row of the card's own grid rather than the last line of `.body`, and it
        follows the aside in the DOM: Apply, Save and Not for me are the acts this page exists for
        and must be the first tab stops on a card. `grid-area: foot` puts it straight back under
        the body, so nothing moves.
      */}
      <p className={styles.footMeta}>
        <span>{reason.freshness(match.lastVerifiedLiveAt, now)}</span>
        {match.wayOfWorking ? (
          <span className={styles.footDot}>{t(`way.${match.wayOfWorking}`)}</span>
        ) : null}
        {/* The separator rides a wrapper, never the button: `::before` content on the named
            element is part of its computed accessible name, and a reader would announce the
            middle dot ahead of the word. */}
        <span className={`${styles.footDot} ${styles.footAction}`}>
          {/* `aria-disabled`, not `disabled`: reporting a post is the action most likely to be
              taken from the keyboard, and a real `disabled` on the button that was just pressed
              takes it out of the tab order with focus still on it, dropping the reader. */}
          <button
            type="button"
            className={styles.quietAction}
            aria-expanded={match.flagged ? undefined : open === "flag"}
            aria-disabled={match.flagged || undefined}
            onClick={() => {
              if (match.flagged) return;
              setOpen(open === "flag" ? "none" : "flag");
            }}
          >
            {match.flagged ? t("match.flagged") : t("match.flag")}
          </button>
        </span>
      </p>

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
