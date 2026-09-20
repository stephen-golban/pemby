"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useId } from "react";
import type { KitPageView } from "@/app/api/kit/_lib/view";
import { AiDisclosure, ChoiceCard, DefaultsForm, KitSections } from "@/components/kit";
import { isKeyFailure, isRetryable } from "../_shared/api";
import { useKit } from "../_shared/use-kit";
import styles from "../kit.module.css";

/**
 * `/kit/[jobId]` — the draft a person edits and sends themselves (PLAN D9).
 *
 * One column, read top to bottom in the order the work is done: which post this is, that the words
 * below it were written by a model, how much of the month's allowance is left, then the draft. The
 * disclosure sits above the button that writes the kit as well as above the kit itself, so nobody
 * reaches a generated sentence without having passed it (Art. 50(1)).
 *
 * The page has one job and several ways of not being able to do it, and each of those is an answer
 * rather than an error:
 *
 *   no profile        the account never finished onboarding, so send them there — telling somebody
 *                     their allowance is spent when they have never had one sends them hunting a
 *                     problem that does not exist
 *   no CV             there is nothing to write from, and a letter invented out of a job post is
 *                     the one failure this feature must never have
 *   defaults unasked  the answers every form wants, asked here because here is where they are
 *                     first needed (PLAN D5)
 *   quota spent       the two ways on, and only two: a pass, or your own OpenRouter account
 *   their key failed  what happened to **their** key, and the same two ways on. Pemby never
 *                     quietly pays instead (phase 09 contract)
 *
 * An existing kit stays readable and copyable through every one of those, because it is already
 * paid for and it is theirs.
 *
 * Nothing on this page submits an application anywhere (PLAN D9, D16).
 */
export function KitClient({ initial }: { initial: KitPageView }) {
  const t = useTranslations("Kit");
  const kit = useKit(initial.job.jobId, initial);
  const page = kit.page;

  const introId = useId();
  const defaultsId = useId();
  const draftId = useId();

  const { job, quota, defaults } = page;
  const quotaSpent = quota.limit !== null && quota.used >= quota.limit;

  // What the reader is looking at: the draft arriving right now, the kit already stored, or
  // nothing. The live draft wins while a generation runs, so the page does not flicker back to an
  // older kit between the last frame of the stream and the re-read that follows it.
  const content = kit.draft ?? page.kit?.content ?? null;
  const showSections = content !== null || kit.generating;

  // The gate, in the order the reader can act on it. `null` means the only thing left to decide is
  // whether there is allowance for another kit.
  const gate =
    page.blocker !== null ? page.blocker : defaults.answeredAt === null ? "defaults" : null;

  return (
    <div className={styles.column} data-pending={kit.pending}>
      <Link className={styles.back} href="/brief">
        {t("back")}
      </Link>

      <header className={styles.intro}>
        <p className={styles.eyebrow}>{t("eyebrow")}</p>
        <h1 id={introId} className={styles.title}>
          {job.title}
        </h1>
        <p className={styles.meta}>
          {job.location === null
            ? t("where.company", { company: job.company })
            : job.otherLocations > 0
              ? t("where.more", {
                  company: job.company,
                  location: job.location,
                  count: job.otherLocations,
                })
              : t("where.at", { company: job.company, location: job.location })}
        </p>
        {/* A real link to the employer's own post. Pemby prepares text; the person applies. */}
        <a
          className={styles.postLink}
          href={job.url}
          target="_blank"
          rel="noopener noreferrer nofollow"
        >
          {t("openPost")}
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
        {/* The one action here that changes anything outside the kit, and it changes only the
            tracker: it records what the person did in the employer's own form. Pemby never applies
            for anyone (PLAN D9, D16), which is why this is a record and not a submit button.

            Drawn only when the server says the write would be accepted. The tracker is a record of
            what Pemby delivered, so a post this person was never shown takes no application row —
            and a button that 404s is worse than no button. The server refuses it either way. */}
        {page.canRecordApplied ? (
          <button
            type="button"
            className={styles.pill}
            aria-pressed={page.applied}
            aria-disabled={page.applied || undefined}
            onClick={() => {
              if (!page.applied) kit.markApplied();
            }}
          >
            {page.applied ? t("appliedDone") : t("applied")}
          </button>
        ) : null}

        {/* A seeded demonstration post, marked where it cannot be missed (DESIGN.md). */}
        {job.demo ? <p className={styles.stamp}>{t("example")}</p> : null}
      </header>

      {/* Art. 50(1): before the button that writes the draft, not only before the draft. */}
      <AiDisclosure provenance={page.kit?.provenance ?? null} />

      <p className={styles.quota}>
        {quota.limit === null
          ? quota.ownKey
            ? t("quota.ownKey")
            : t("quota.unlimited")
          : t("quota.used", { used: Math.min(quota.used, quota.limit), limit: quota.limit })}
      </p>

      {kit.error ? (
        <p className={styles.alert} role="alert">
          {t(`errors.${kit.error}`)}{" "}
          {isRetryable(kit.error) ? (
            <button type="button" className={styles.textAction} onClick={kit.write}>
              {t("tryAgain")}
            </button>
          ) : null}
        </p>
      ) : null}

      {kit.failed ? (
        <p className={styles.alert} role="alert">
          {t("failed")}{" "}
          <button type="button" className={styles.textAction} onClick={kit.retry}>
            {t("retry")}
          </button>
        </p>
      ) : null}

      {gate === "no_profile" ? (
        <ChoiceCard
          title={t("noProfile.title")}
          body={t("noProfile.body")}
          actions={[{ label: t("noProfile.action"), href: "/onboarding", primary: true }]}
        />
      ) : gate === "no_cv" ? (
        <ChoiceCard
          title={t("noCv.title")}
          body={t("noCv.body")}
          actions={[{ label: t("noCv.action"), href: "/profile", primary: true }]}
        />
      ) : gate === "defaults" ? (
        <section className={styles.topic} aria-labelledby={defaultsId}>
          <h2 id={defaultsId} className={styles.topicTitle}>
            {t("defaults.title")}
          </h2>
          <p className={styles.topicLead}>{t("defaults.lead")}</p>
          <DefaultsForm defaults={defaults} labelledBy={defaultsId} onChange={kit.saveDefaults} />
        </section>
      ) : null}

      {gate === null || showSections ? (
        <section className={styles.topic} aria-labelledby={draftId}>
          <h2 id={draftId} className={styles.topicTitle}>
            {t("draft.title")}
          </h2>

          {showSections ? (
            <KitSections
              content={content}
              provenance={page.kit?.provenance ?? null}
              writing={kit.generating}
              screeningAsked={job.screeningQuestions.length}
            />
          ) : null}

          {/* Why there is no button, when there is no button. A spent quota and a key that stopped
              working get the same two ways on, because they are the same question: who pays for
              the next one. Nothing here falls back to Pemby's key. */}
          {kit.error !== null && isKeyFailure(kit.error) ? (
            <ChoiceCard
              title={t("keyFailed.title")}
              body={t("keyFailed.body")}
              actions={[
                { label: t("spent.connect"), href: "/settings", primary: true },
                { label: t("spent.pass"), href: "/pricing" },
              ]}
            />
          ) : quotaSpent && !kit.generating ? (
            <ChoiceCard
              title={t("spent.title")}
              body={t("spent.body", { limit: quota.limit ?? 0 })}
              actions={[
                { label: t("spent.pass"), href: "/pricing", primary: true },
                { label: t("spent.connect"), href: "/settings" },
              ]}
            />
          ) : gate === null ? (
            <div className={styles.start}>
              <button
                type="button"
                className={styles.primary}
                disabled={kit.generating}
                onClick={kit.write}
              >
                {kit.generating
                  ? t("draft.writing")
                  : page.kit
                    ? t("draft.again")
                    : t("draft.write")}
              </button>
              <p className={styles.startNote}>
                {page.kit ? t("draft.againNote") : t("draft.writeNote")}
              </p>
            </div>
          ) : null}

          {/* The editing instruction, restated where the reader is about to act on the text rather
              than only at the top. This half is advice; the half at the top is the disclosure. */}
          {showSections ? <p className={styles.startNote}>{t("draft.editNote")}</p> : null}
        </section>
      ) : null}
    </div>
  );
}
