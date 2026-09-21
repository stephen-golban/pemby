"use client";

import { useFormatter, useNow, useTranslations } from "next-intl";
import styles from "./channels.module.css";
import { PauseMark, ResumeMark } from "./marks";

/**
 * "Hold everything" (PLAN D8): one switch across every channel at once.
 *
 * Its own white card at the foot of the page rather than a row in the channels one, for the reason
 * `/profile` puts export and deletion apart: it is a decision about the whole product, not one
 * setting among several, and it is the thing someone reaches for when a match has just arrived at a
 * bad moment. Its tile is near-black while delivery is running and the blocker red while it is
 * held, so the state is a colour, a mark and a sentence rather than any one of them.
 *
 * `profiles.delivery_paused_at` is a timestamp and not a flag, so the card can say how long
 * delivery has been held. That matters: a hold nobody remembers setting is how a person concludes
 * the product stopped working.
 *
 * It does not touch any channel's own switch. `/resume` and this button both clear one column, so
 * a channel the person had turned off stays off (`packages/db/src/schema/delivery.ts`).
 */
export function PausePanel({
  pausedAt,
  onChange,
}: {
  pausedAt: string | null;
  onChange: (paused: boolean) => void;
}) {
  const t = useTranslations("Settings.pause");
  const format = useFormatter();
  // `relativeTime` needs an explicit "now", or next-intl falls back to the current clock and warns:
  // the server and the browser would then measure the same hold from two different instants and the
  // sentence would change between the paint and the hydration. `useNow()` is one instant for both.
  // Refreshed once a minute, so "held 2 minutes ago" is what the card says two minutes later
  // without anyone reloading.
  const now = useNow({ updateInterval: 60_000 });
  const paused = pausedAt !== null;

  // The hold that happened a second ago is the common case — the person just pressed the button —
  // and it is the one `relativeTime` reads worst: `now` was captured before the click, so the hold
  // is in its future and it says "in 14 seconds". Under a minute the card says "just now" instead,
  // which is both true and what a person would say.
  const justNow = paused && now.getTime() - new Date(pausedAt).getTime() < 60_000;

  return (
    <section
      className={styles.pause}
      data-paused={paused || undefined}
      aria-labelledby="settings-pause-title"
    >
      <span className={styles.tile} data-accent={paused ? "red" : "ink"}>
        {paused ? (
          <ResumeMark className={styles.tileMark} />
        ) : (
          <PauseMark className={styles.tileMark} />
        )}
      </span>
      <div className={styles.pauseBody}>
        <h2 id="settings-pause-title" className={styles.pauseTitle}>
          {paused ? t("heldTitle") : t("title")}
        </h2>
        <p className={styles.pauseNote}>
          {!paused
            ? t("body")
            : justNow
              ? t("heldBodyJustNow")
              : t("heldBody", { since: format.relativeTime(new Date(pausedAt), now) })}
        </p>
        {/* A button whose label is the action, not a switch: "Hold delivery" and "Start again" are
            two different sentences, and a `switch` is meant to carry its state in `aria-checked`
            under one unchanging label. The heading above already says which state this is in. */}
        <button
          type="button"
          className={paused ? styles.primary : styles.pill}
          onClick={() => onChange(!paused)}
        >
          {paused ? t("resume") : t("hold")}
        </button>
      </div>
    </section>
  );
}
