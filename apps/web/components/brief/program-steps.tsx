"use client";

import { useTranslations } from "next-intl";
import type { ProgramNextStep } from "@pemby/core/programs";
import { useReasonText } from "./reasons";
import styles from "./brief.module.css";

/**
 * A junior's real next step when the Brief is silent (PLAN D7, D11): the programs calendar,
 * rendered from the keys `nextProgramSteps` returns rather than from any sentence built here.
 *
 * A window the source has not published yet is marked "expected" with a dashed badge — dashed
 * means "not yet" in this system — and the reason lines say in words that the date is inferred
 * from past years. Nothing is presented as confirmed that the program has not confirmed.
 */
export function ProgramSteps({ steps }: { steps: readonly ProgramNextStep[] }) {
  const t = useTranslations("Brief");
  const reason = useReasonText();

  return (
    <ul className={styles.programs}>
      {steps.map((step) => (
        <li key={step.programId} className={styles.program}>
          <div className={styles.programHead}>
            <h3 className={styles.programName}>{step.programName}</h3>
            <span className={styles.status} data-expected={step.step === "expected"}>
              {step.step === "open-now"
                ? t("programs.openNow")
                : step.step === "opens-on"
                  ? t("programs.opensOn", { date: step.opensOn ?? "" })
                  : t("programs.expected")}
            </span>
          </div>
          <p className={styles.reason}>{reason.program(step.headline)}</p>
          <ul className={styles.points}>
            {step.detail.map((line, index) => (
              <li key={`${line.key}-${index}`} className={styles.point}>
                {reason.program(line)}
              </li>
            ))}
          </ul>
          {step.sourceUrl ? (
            <a
              className={styles.apply}
              href={step.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t("programs.sourceLabel", { program: step.programName })}
            >
              {t("programs.source")}
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
          ) : null}
        </li>
      ))}
    </ul>
  );
}
