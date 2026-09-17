"use client";

import { useTranslations } from "next-intl";
import { useId } from "react";
import type { ProfileView } from "@/app/api/profile/_lib/view";
import { DeletePanel, ExportPanel, SaveWorkPanel } from "./_shared/account";
import { CountryListProvider } from "./_shared/countries";
import { MatchCountLine } from "./_shared/count-rail";
import { EligibilityRows, RoleRows, WaysRows } from "./_shared/rows";
import { StrengthMeter } from "./_shared/strength";
import { useMatchCount, useProfile } from "./_shared/use-profile";
import styles from "./profile.module.css";

/**
 * `/profile` — everything the three onboarding steps collected, editable for good, plus the
 * profile strength meter, the data export and account deletion.
 *
 * The rows are the same components onboarding uses, so a field cannot mean one thing during setup
 * and another afterwards. There is no Save button: every edit saves optimistically and rolls back
 * with its reason (`use-profile.ts`).
 */
export function ProfileClient({
  initial,
  countryCodes,
  countEnabled,
}: {
  initial: ProfileView;
  countryCodes: readonly string[];
  countEnabled: boolean;
}) {
  const t = useTranslations("Onboarding.profile");
  const steps = useTranslations("Onboarding.steps");
  const errors = useTranslations("Onboarding.errors");

  const { profile, save, error } = useProfile(initial);
  const count = useMatchCount(profile, countEnabled);

  const eligibilityId = useId();
  const waysId = useId();
  const roleId = useId();
  const countId = useId();

  return (
    <CountryListProvider codes={countryCodes}>
      <div className={styles.layout}>
        <div className={styles.main}>
          <header className={styles.intro}>
            <h1 className={styles.title}>{t("title")}</h1>
            <p className={styles.lead}>{t("lead")}</p>
          </header>

          {error ? (
            <p className={styles.alert} role="alert">
              {errors(error)}
            </p>
          ) : null}

          <section className={styles.topic} aria-labelledby={eligibilityId}>
            <h2 id={eligibilityId} className={styles.topicTitle}>
              {steps("eligibility")}
            </h2>
            <EligibilityRows profile={profile} save={save} labelledBy={eligibilityId} />
          </section>

          <section className={styles.topic} aria-labelledby={waysId}>
            <h2 id={waysId} className={styles.topicTitle}>
              {steps("ways")}
            </h2>
            <WaysRows profile={profile} save={save} labelledBy={waysId} />
          </section>

          <section className={styles.topic} aria-labelledby={roleId}>
            <h2 id={roleId} className={styles.topicTitle}>
              {steps("role")}
            </h2>
            <RoleRows profile={profile} save={save} labelledBy={roleId} />
          </section>

          <div className={styles.account}>
            <ExportPanel />
            <DeletePanel anonymous={profile.anonymous} />
          </div>
        </div>

        <aside className={styles.rail} aria-label={t("railLabel")}>
          <StrengthMeter profile={profile} />
          {countEnabled ? (
            <MatchCountLine profile={profile} count={count} headingId={countId} />
          ) : null}
          {profile.anonymous ? <SaveWorkPanel /> : null}
        </aside>
      </div>
    </CountryListProvider>
  );
}
