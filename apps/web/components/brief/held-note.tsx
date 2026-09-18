"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import styles from "./brief.module.css";

/** Under this, "in about 0h" would be the honest arithmetic and the wrong sentence. */
const SOON_MS = 60 * 60 * 1000;

/**
 * What a free account is told about the matches Pemby has found and is not due to deliver yet
 * (PLAN D13: every free match arrives 24h after the post was first seen, on every channel, and
 * this page is a channel).
 *
 * A count and a time, and nothing else. The role, the company, the reasons and the link are the
 * thing being held back, so printing them here under a "held until" caption would deliver the
 * match through the web while the product claimed it had not — which is what this note replaced.
 * What the person gets instead is the part that is actually useful while waiting: that something
 * is coming, and when.
 *
 * Drawn with a dashed outline, which is what "not yet" is drawn as in this system (DESIGN.md,
 * Shapes: the 24-hour-late note is one of the three things that stroke belongs to). `lead` is the
 * denser reading, for the days when this note is the page's whole answer.
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
    <section className={styles.heldNote} data-lead={lead} aria-label={t("label")}>
      <h2 className={styles.heldTitle}>{t("title", { count })}</h2>
      <p className={styles.heldBody}>{body}</p>
      <p className={styles.heldBody}>{t("pass")}</p>
      <Link className={styles.heldLink} href="/pricing">
        {t("passLink")}
      </Link>
    </section>
  );
}
