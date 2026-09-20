"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { KitContentView, KitProvenance } from "@/app/api/kit/_lib/view";
import styles from "./kit.module.css";

/**
 * The kit itself: three sections of a ledger, each with its own Copy.
 *
 * The sections **are** the copy boundary, which is why they are the unit this component acts on. A
 * person pastes bullets into a CV editor, a letter into one form field and one answer into another,
 * at three different moments — so one "copy the kit" button would put something on the clipboard
 * that nobody wants. Screening answers get a Copy on each answer as well as one on the section,
 * because one field takes one answer.
 *
 * Streaming is the loading state. There is no spinner and no skeleton: the section that is being
 * written shows the words that have arrived with a caret after them, and the ones that have not
 * started show a dashed rule, which is this system's "not yet" (DESIGN.md). Copy stays disabled
 * until a section is finished, because half a cover letter on the clipboard is worse than none.
 */
export function KitSections({
  content,
  provenance,
  writing,
  screeningAsked,
}: {
  /** The stored kit, or the partial one arriving right now, or null before either exists. */
  content: Partial<KitContentView> | null;
  /** Present once a kit is stored; carries the marking's own fields as data attributes. */
  provenance: KitProvenance | null;
  /** A generation is running: sections may still fill, and nothing is final. */
  writing: boolean;
  /** How many screening questions Pemby found in the post, so an empty section can say why. */
  screeningAsked: number;
}) {
  const t = useTranslations("Kit");

  const bullets = content?.cvBullets ?? [];
  const letter = content?.coverLetter ?? "";
  const answers = content?.screeningAnswers ?? [];

  return (
    <div
      className={styles.sections}
      // The marking again, as attributes on the element that holds the generated text, so a reader
      // of the DOM rather than of the JSON-LD still finds it on the content itself.
      data-ai-generated="true"
      {...(provenance
        ? { "data-ai-model": provenance.model, "data-ai-generated-at": provenance.generatedAt }
        : {})}
    >
      <Section
        name={t("sections.cvBullets")}
        count={bullets.length > 0 ? t("sections.bulletCount", { count: bullets.length }) : null}
        copy={bullets.length > 0 && !writing ? bullets.join("\n") : null}
        empty={writing ? t("sections.writing") : t("sections.notYet")}
        filled={bullets.length > 0}
      >
        <ul className={styles.bullets}>
          {bullets.map((bullet, index) => (
            // Keyed by position: two bullets can read the same, and the list is replaced whole on
            // every frame of the stream.
            <li key={index} className={styles.bullet}>
              {bullet}
              {writing && index === bullets.length - 1 ? <Caret /> : null}
            </li>
          ))}
        </ul>
      </Section>

      <Section
        name={t("sections.coverLetter")}
        count={null}
        copy={letter !== "" && !writing ? letter : null}
        empty={writing ? t("sections.writing") : t("sections.notYet")}
        filled={letter !== ""}
      >
        <p className={styles.letter}>
          {letter}
          {writing ? <Caret /> : null}
        </p>
      </Section>

      <Section
        name={t("sections.screeningAnswers")}
        count={answers.length > 0 ? t("sections.answerCount", { count: answers.length }) : null}
        copy={
          answers.length > 0 && !writing
            ? answers.map((entry) => `${entry.question}\n${entry.answer}`).join("\n\n")
            : null
        }
        // An empty screening section is usually correct rather than unfinished: most posts ask
        // nothing. Saying which of the two it is costs one string and saves the reader a reload.
        empty={
          writing
            ? t("sections.writing")
            : screeningAsked === 0
              ? t("sections.noQuestions")
              : t("sections.notYet")
        }
        filled={answers.length > 0}
      >
        <ul className={styles.answers}>
          {answers.map((entry, index) => (
            <li key={index} className={styles.answer}>
              <div className={styles.answerHead}>
                <h4 className={styles.question}>{entry.question}</h4>
                <CopyButton
                  text={writing ? null : entry.answer}
                  label={t("sections.copyAnswer")}
                  small
                />
              </div>
              <p className={styles.answerBody}>
                {entry.answer}
                {writing && index === answers.length - 1 ? <Caret /> : null}
              </p>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

function Section({
  name,
  count,
  copy,
  empty,
  filled,
  children,
}: {
  name: string;
  count: string | null;
  /** What Copy puts on the clipboard, or null while there is nothing final to copy. */
  copy: string | null;
  empty: string;
  filled: boolean;
  children: ReactNode;
}) {
  const t = useTranslations("Kit");
  return (
    <section className={styles.section}>
      <div className={styles.sectionHead}>
        <h3 className={styles.sectionName}>
          {name}
          {count ? <span className={styles.sectionCount}>{count}</span> : null}
        </h3>
        <CopyButton text={copy} label={t("sections.copy")} />
      </div>
      {filled ? children : <p className={styles.placeholder}>{empty}</p>}
    </section>
  );
}

/**
 * Copy, and say so.
 *
 * `aria-disabled` rather than `disabled` for the same reason the Brief's report button uses it: a
 * control that leaves the tab order while focus is still on it drops a keyboard reader where they
 * stand. The "Copied" label reverts after a beat, and the timer is cleared on unmount so a section
 * that re-renders mid-stream cannot set state on a component that is gone.
 */
function CopyButton({
  text,
  label,
  small,
}: {
  text: string | null;
  label: string;
  small?: boolean;
}) {
  const t = useTranslations("Kit");
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const onClick = useCallback(() => {
    if (text === null) return;
    void navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(true);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), 2200);
      })
      .catch(() => setCopied(false));
  }, [text]);

  return (
    <button
      type="button"
      className={small ? `${styles.pill} ${styles.small}` : styles.pill}
      aria-disabled={text === null || undefined}
      aria-live="polite"
      onClick={onClick}
    >
      {copied ? t("sections.copied") : label}
    </button>
  );
}

/** "More is coming." A state indicator; it holds still under `prefers-reduced-motion`. */
function Caret() {
  return <span className={styles.caret} aria-hidden="true" />;
}
