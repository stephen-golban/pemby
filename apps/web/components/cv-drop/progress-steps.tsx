"use client";

import { useTranslations } from "next-intl";
import styles from "./cv-drop.module.css";

const STEPS = ["upload", "read", "profile", "roles"] as const;
export type CvStep = (typeof STEPS)[number];

/**
 * Where the CV has got to, as four ledger steps. Done steps carry the filled ticked square that
 * DESIGN.md reserves for a criterion that is met; the step in progress is outlined; steps not
 * reached yet are dashed ("not yet"). The words, not the shapes, carry the state for a screen
 * reader: every item names its own state.
 */
export function ProgressSteps({ current }: { current: number }) {
  const t = useTranslations("Cv.steps");
  return (
    <ol className={styles.steps} aria-label={t("label")}>
      {STEPS.map((step, index) => {
        const state = index < current ? "done" : index === current ? "current" : "pending";
        const label = t(step);
        return (
          <li key={step} className={styles.step} data-state={state}>
            <span className={styles.stepMark} aria-hidden="true">
              {state === "done" ? (
                <svg viewBox="0 0 14 14" focusable="false">
                  <path
                    d="M3 7.4 5.9 10 11 4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : null}
            </span>
            <span className={styles.stepLabel} aria-hidden="true">
              {label}
            </span>
            <span className="visually-hidden">{t(state, { step: label })}</span>
          </li>
        );
      })}
    </ol>
  );
}
