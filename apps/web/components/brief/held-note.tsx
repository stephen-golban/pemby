"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { ArrowMark, BlockerMark } from "./marks";
import styles from "./brief.module.css";

/** Under this, "in about 0h" would be the honest arithmetic and the wrong sentence. */
const SOON_MS = 60 * 60 * 1000;

/**
 * What a free account is told about the matches Pemby has found and is not due to deliver yet
 * (PLAN D13: every free match arrives 24h after the post was first seen, on every channel, and this
 * page is a channel).
 *
 * A count and a time, and nothing else. The role, the company, the reasons and the link are the
 * thing being held back, so printing them here under a "held until" caption would deliver the match
 * through the web while the product claimed it had not.
 *
 * Drawn as a white card with a solid yellow tile and a clock on it — the same vocabulary the
 * freshness blocker uses, because it is the same fact: something is waiting on a clock. `lead` is
 * the denser reading, for the days when this card is the page's whole answer.
 */
export function HeldNote({
  count,
  nextAt,
  now,
  lead,
}: {
  count: number;
  /** ISO, the earliest one still to come. */
  nextAt: string | null;
  /** The server's own read instant, so first paint and hydrated markup agree on "in about 6h". */
  now: number;
  lead: boolean;
}) {
  const t = useTranslations("Brief.held");
  if (count <= 0) return null;

  // Measured against the server's clock rather than the reader's, and in hours rather than as a
  // wall-clock time: this page has no configured time zone, and a formatted time would be the
  // server's on the first paint and the browser's a moment later.
  const remaining = nextAt === null ? null : Date.parse(nextAt) - now;
  const body =
    remaining === null || Number.isNaN(remaining)
      ? t("bodyNoTime")
      : remaining < SOON_MS
        ? t("bodySoon")
        : t("body", { hours: Math.round(remaining / SOON_MS) });

  return (
    <section className={styles.held} data-lead={lead} aria-label={t("label")}>
      <span className={styles.heldTile} data-accent="yellow">
        <BlockerMark blocker="freshness" className={styles.blockerMark} />
      </span>

      <div className={styles.heldBodyWrap}>
        {/* On the days this card is the page's whole answer the headline above it already says
            how many are waiting, so the card does not say it twice. */}
        {lead ? null : <h2 className={styles.heldTitle}>{t("title", { count })}</h2>}
        <p className={styles.heldBody}>{body}</p>
        <p className={styles.heldBody}>{t("pass")}</p>
        <Link className={styles.outlinePill} href="/pricing">
          {t("passLink")}
          <ArrowMark className={styles.applyArrow} />
        </Link>
      </div>
    </section>
  );
}
