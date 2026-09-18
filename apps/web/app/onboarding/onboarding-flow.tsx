"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { ProfilePatch, ProfileView } from "@/app/api/profile/_lib/view";
import { SaveWorkPanel } from "@/app/profile/_shared/account";
import { errorCodeOf, postOnboardingComplete, profileKey } from "@/app/profile/_shared/api";
import { CountryListProvider } from "@/app/profile/_shared/countries";
import { MatchCountLine } from "@/app/profile/_shared/count-rail";
import { fieldAnchor } from "@/app/profile/_shared/rows";
import { EligibilityRows, RoleRows, WaysRows, type RowsProps } from "@/app/profile/_shared/rows";
import { useMatchCount, useProfile } from "@/app/profile/_shared/use-profile";
import type { ProfileClientError } from "@/app/profile/_shared/api";
import styles from "./onboarding.module.css";

/**
 * The three steps of PLAN D5: eligibility, ways of working, role and money. One topic per step,
 * every row already answered from the CV, one action to accept the lot, and a live count beside
 * them that moves with every edit.
 *
 * Accepting a step writes the values on screen back to the profile. That matters because a row can
 * be showing a value the parse job put in the CV but not yet in `profiles` (`loadProfileView`
 * explains the fallback): one tap on "Looks right" is what makes the pre-filled answer the stored
 * answer.
 *
 * Steps 2 and 3 can be skipped; step 1 cannot, and it will not advance without a residence
 * country, because that is the field the eligibility gate runs on.
 */

type StepKey = "eligibility" | "ways" | "role";

interface Step {
  key: StepKey;
  Rows: (props: RowsProps & { labelledBy?: string }) => ReactNode;
  skippable: boolean;
}

// A tuple, so `STEPS[0]` is known to exist and the fallback below needs no guard.
const STEPS = [
  { key: "eligibility", Rows: EligibilityRows, skippable: false },
  { key: "ways", Rows: WaysRows, skippable: true },
  { key: "role", Rows: RoleRows, skippable: true },
] as const satisfies readonly Step[];

/** What "accept this step" writes back, per step. */
function stepPatch(step: StepKey, profile: ProfileView): ProfilePatch {
  switch (step) {
    case "eligibility":
      return {
        citizenships: profile.citizenships,
        residenceCountry: profile.residenceCountry,
        timezone: profile.timezone,
        minOverlapHours: profile.minOverlapHours,
        hasOwnCompany: profile.hasOwnCompany,
        permits: profile.permits,
        englishLevel: profile.englishLevel,
      };
    case "ways":
      return {
        waysOfWorking: profile.waysOfWorking,
        employmentTypes: profile.employmentTypes,
      };
    case "role":
      return {
        titles: profile.titles,
        seniority: profile.seniority,
        stack: profile.stack,
        minRate: profile.minRate,
        minRateCurrency: profile.minRateCurrency,
        minRatePeriod: profile.minRatePeriod,
        dealbreakers: profile.dealbreakers,
        hideNoSalary: profile.hideNoSalary,
      };
  }
}

export function OnboardingFlow({
  initial,
  countryCodes,
  countEnabled,
}: {
  initial: ProfileView;
  countryCodes: readonly string[];
  /** The teaser is a phase-06 staging surface; without it the rail carries the steps alone. */
  countEnabled: boolean;
}) {
  const t = useTranslations("Onboarding");
  const errors = useTranslations("Onboarding.errors");
  const queryClient = useQueryClient();

  const { profile, save, error } = useProfile(initial);
  const count = useMatchCount(profile, countEnabled);

  const [index, setIndex] = useState(0);
  const [blocked, setBlocked] = useState(false);
  const [finished, setFinished] = useState(profile.onboardingCompletedAt !== null);
  const [finishError, setFinishError] = useState<ProfileClientError | null>(null);

  const heading = useRef<HTMLHeadingElement>(null);
  const moveFocus = useRef(false);
  const headingId = useId();
  const countId = useId();

  const finish = useMutation({
    mutationFn: postOnboardingComplete,
    // Optimistic: the done panel is on screen before the stamp comes back, and rolls back with the
    // reason if it does not.
    onMutate: () => {
      setFinishError(null);
      setFinished(true);
    },
    onError: (failure) => {
      setFinished(false);
      setFinishError(errorCodeOf(failure));
    },
    onSuccess: (saved) => queryClient.setQueryData(profileKey, saved),
  });

  useEffect(() => {
    if (!moveFocus.current) return;
    moveFocus.current = false;
    heading.current?.focus();
  }, [index, finished]);

  const step: Step = STEPS[index] ?? STEPS[0];

  function go(next: number) {
    moveFocus.current = true;
    setBlocked(false);
    setIndex(next);
  }

  function accept() {
    if (step.key === "eligibility" && profile.residenceCountry === null) {
      setBlocked(true);
      document.getElementById(fieldAnchor("residenceCountry"))?.scrollIntoView({ block: "center" });
      return;
    }
    save(stepPatch(step.key, profile));
    if (index === STEPS.length - 1) {
      moveFocus.current = true;
      finish.mutate();
    } else {
      go(index + 1);
    }
  }

  function skip() {
    if (index === STEPS.length - 1) {
      moveFocus.current = true;
      finish.mutate();
    } else {
      go(index + 1);
    }
  }

  const rail = (
    <aside className={styles.rail} aria-label={t("steps.label")}>
      {countEnabled ? <MatchCountLine profile={profile} count={count} headingId={countId} /> : null}
      {/* "Step 1 of 3" beside a heading that says setup is over contradicts it; once the flow is
          finished the ticked list is the whole story. */}
      {finished ? null : (
        <p className={styles.position}>
          {t("steps.position", { index: index + 1, total: STEPS.length })}
        </p>
      )}
      <ol className={styles.stepList}>
        {STEPS.map((entry, i) => {
          const state = finished || i < index ? "done" : i === index ? "current" : "todo";
          return (
            <li key={entry.key} className={styles.step} data-state={state}>
              <span className={styles.stepMark} aria-hidden="true">
                <svg viewBox="0 0 16 16" focusable="false">
                  <path
                    d="M3 8.5 6.2 11.5 13 4.8"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              <span className={styles.stepName}>{t(`steps.${entry.key}`)}</span>
              <span className="visually-hidden">{t(`steps.${state}`)}</span>
            </li>
          );
        })}
      </ol>
      {profile.anonymous ? <SaveWorkPanel /> : null}
    </aside>
  );

  if (finished) {
    return (
      <CountryListProvider codes={countryCodes}>
        <div className={styles.layout}>
          <section className={styles.main} aria-labelledby={headingId}>
            <h1 ref={heading} id={headingId} tabIndex={-1} className={styles.title}>
              {t("done.title")}
            </h1>
            <p className={styles.lead}>{t("done.body")}</p>
            <p className={styles.note}>{t("done.next")}</p>
            {/* Someone who has just finished setup wants the roles, not the form they just filled
                in, so the Brief is the primary action and the profile stays one tap away. */}
            <div className={styles.actions}>
              <Link className={styles.primary} href="/brief">
                {t("done.cta")}
              </Link>
              <Link className={styles.textButton} href="/profile">
                {t("done.profileCta")}
              </Link>
              {finish.isPending ? (
                <span className={styles.saving}>{t("actions.saving")}</span>
              ) : null}
            </div>
          </section>
          {rail}
        </div>
      </CountryListProvider>
    );
  }

  const Rows = step.Rows;

  return (
    <CountryListProvider codes={countryCodes}>
      <div className={styles.layout}>
        <section className={styles.main} aria-labelledby={headingId}>
          <h1 ref={heading} id={headingId} tabIndex={-1} className={styles.title}>
            {t(`step.${step.key}.title`)}
          </h1>
          <p className={styles.lead}>{t(`step.${step.key}.lead`)}</p>

          <Rows profile={profile} save={save} labelledBy={headingId} />

          {blocked ? (
            <p className={styles.alert} role="alert">
              {t("blocked.residenceCountry")}
            </p>
          ) : null}
          {error ? (
            <p className={styles.alert} role="alert">
              {errors(error)}
            </p>
          ) : null}
          {finishError ? (
            <p className={styles.alert} role="alert">
              {errors(finishError)}
            </p>
          ) : null}

          <div className={styles.actions}>
            <button type="button" className={styles.primary} onClick={accept}>
              {index === STEPS.length - 1 ? t("actions.finish") : t("actions.next")}
            </button>
            {step.skippable ? (
              <button type="button" className={styles.textButton} onClick={skip}>
                {t("actions.skip")}
              </button>
            ) : null}
            {index > 0 ? (
              <button type="button" className={styles.textButton} onClick={() => go(index - 1)}>
                {t("actions.back")}
              </button>
            ) : null}
          </div>
        </section>
        {rail}
      </div>
    </CountryListProvider>
  );
}
