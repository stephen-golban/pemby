"use client";

import { useTranslations } from "next-intl";
import { useCountryName } from "@/components/profile";
import {
  CURRENCIES,
  EMPLOYMENT_TYPES,
  ENGLISH_LEVELS,
  PAY_PERIODS,
  PERMIT_KINDS,
  PROFILE_LIMITS,
  SENIORITIES,
  WAYS_OF_WORKING,
  type ProfilePatch,
  type ProfileView,
} from "@/app/api/profile/_lib/view";
import {
  ChoiceEditor,
  CountryChipsEditor,
  CountryEditor,
  FieldRow,
  Ledger,
  MultiChoiceEditor,
  NumberEditor,
  PermitsEditor,
  RateEditor,
  TextChipsEditor,
  TimezoneEditor,
  ValueChips,
  YesNoEditor,
  type Option,
  type PermitValue,
} from "./fields";

/**
 * The three topics of PLAN D5 as editable ledgers, shared verbatim by `/onboarding` (one topic per
 * step) and `/profile` (all three, one after another). One definition, so a field can never mean
 * one thing during setup and another afterwards.
 *
 * Every row saves through `save`, which is optimistic with rollback in `use-profile.ts`. A row's
 * `id` is `field-<key>`, which is what the strength meter's gap pills link to.
 */

export type SaveFn = (patch: ProfilePatch) => void;

export interface RowsProps {
  profile: ProfileView;
  save: SaveFn;
}

export const fieldAnchor = (key: string) => `field-${key}`;

/** Both the row key and the message key; `Onboarding.fields.*`, `.help.*` and `.empty.*` match it. */
type FieldKey =
  | "citizenships"
  | "residenceCountry"
  | "timezone"
  | "minOverlapHours"
  | "hasOwnCompany"
  | "permits"
  | "englishLevel"
  | "waysOfWorking"
  | "employmentTypes"
  | "titles"
  | "seniority"
  | "stack"
  | "minRate"
  | "dealbreakers"
  | "hideNoSalary";

function useFieldText() {
  const fields = useTranslations("Onboarding.fields");
  const help = useTranslations("Onboarding.help");
  const empty = useTranslations("Onboarding.empty");
  return (key: FieldKey) => ({
    label: fields(key),
    help: help(key),
    empty: empty(key),
  });
}

function useOptions() {
  const values = useTranslations("Onboarding.values");
  const cv = useTranslations("Cv.profile");

  const ways: Option<(typeof WAYS_OF_WORKING)[number]>[] = WAYS_OF_WORKING.map((value) => ({
    value,
    label: values(`ways.${value}`),
    help: values(`waysHelp.${value}`),
  }));
  const employment: Option<(typeof EMPLOYMENT_TYPES)[number]>[] = EMPLOYMENT_TYPES.map((value) => ({
    value,
    label: values(`employment.${value}`),
  }));
  const levels: Option<(typeof ENGLISH_LEVELS)[number]>[] = ENGLISH_LEVELS.map((value) => ({
    value,
    label: cv(`levels.${value}`),
  }));
  const seniorities: Option<(typeof SENIORITIES)[number]>[] = SENIORITIES.map((value) => ({
    value,
    label: cv(`seniority.${value}`),
  }));
  const permitKinds: Option<string>[] = PERMIT_KINDS.map((value) => ({
    value,
    label: values(`permitKinds.${value}`),
  }));
  const periods: Option<string>[] = PAY_PERIODS.map((value) => ({
    value,
    label: values(`periods.${value}`),
  }));
  return { ways, employment, levels, seniorities, permitKinds, periods };
}

// Step 1: eligibility -----------------------------------------------------

export function EligibilityRows({
  profile,
  save,
  labelledBy,
}: RowsProps & { labelledBy?: string }) {
  const text = useFieldText();
  const options = useOptions();
  const values = useTranslations("Onboarding.values");
  const units = useTranslations("Onboarding.units");
  const actions = useTranslations("Onboarding.actions");
  const countryName = useCountryName();
  const L = PROFILE_LIMITS;

  const citizenshipNames = profile.citizenships.map((code) => countryName(code) ?? code);

  return (
    <Ledger labelledBy={labelledBy}>
      <FieldRow
        id={fieldAnchor("citizenships")}
        {...text("citizenships")}
        filled={profile.citizenships.length > 0}
        value={<ValueChips values={citizenshipNames} label={text("citizenships").label} />}
        editor={() => (
          <CountryChipsEditor
            legend={text("citizenships").label}
            values={profile.citizenships}
            max={L.citizenships}
            onChange={(citizenships) => save({ citizenships })}
          />
        )}
      />
      <FieldRow
        id={fieldAnchor("residenceCountry")}
        {...text("residenceCountry")}
        filled={profile.residenceCountry !== null}
        value={profile.residenceCountry ? countryName(profile.residenceCountry) : null}
        editor={() => (
          <CountryEditor
            legend={text("residenceCountry").label}
            value={profile.residenceCountry}
            onChange={(residenceCountry) => save({ residenceCountry })}
          />
        )}
      />
      <FieldRow
        id={fieldAnchor("timezone")}
        {...text("timezone")}
        filled={profile.timezone !== null}
        value={profile.timezone}
        editor={() => (
          <TimezoneEditor
            legend={text("timezone").label}
            value={profile.timezone}
            onChange={(timezone) => save({ timezone })}
          />
        )}
      />
      <FieldRow
        id={fieldAnchor("minOverlapHours")}
        {...text("minOverlapHours")}
        filled={profile.minOverlapHours !== null}
        value={
          profile.minOverlapHours !== null
            ? units("hours", { count: profile.minOverlapHours })
            : null
        }
        editor={() => (
          <NumberEditor
            legend={text("minOverlapHours").label}
            value={profile.minOverlapHours}
            min={0}
            max={L.minOverlapHours}
            suffix={units("hoursSuffix")}
            onChange={(minOverlapHours) => save({ minOverlapHours })}
          />
        )}
      />
      <FieldRow
        id={fieldAnchor("hasOwnCompany")}
        {...text("hasOwnCompany")}
        filled
        value={actions(profile.hasOwnCompany ? "yes" : "no")}
        editor={() => (
          <YesNoEditor
            legend={text("hasOwnCompany").label}
            value={profile.hasOwnCompany}
            onChange={(hasOwnCompany) => save({ hasOwnCompany })}
          />
        )}
      />
      <FieldRow
        id={fieldAnchor("permits")}
        {...text("permits")}
        filled={profile.permits.length > 0}
        value={
          <ValueChips
            values={profile.permits.map(
              (permit) =>
                `${countryName(permit.country) ?? permit.country} · ${values(`permitKinds.${permit.kind}`)}`,
            )}
            label={text("permits").label}
          />
        }
        editor={() => (
          <PermitsEditor
            legend={text("permits").label}
            values={profile.permits}
            kinds={options.permitKinds}
            max={L.permits}
            labels={{
              country: values("permitCountry"),
              kind: values("permitKind"),
              expires: values("permitExpires"),
            }}
            onChange={(permits) => save({ permits: permits as ProfileView["permits"] })}
          />
        )}
      />
      <FieldRow
        id={fieldAnchor("englishLevel")}
        {...text("englishLevel")}
        filled={profile.englishLevel !== null}
        value={
          profile.englishLevel
            ? options.levels.find((l) => l.value === profile.englishLevel)?.label
            : null
        }
        editor={() => (
          <ChoiceEditor
            legend={text("englishLevel").label}
            options={options.levels}
            value={profile.englishLevel}
            clearable
            onChange={(englishLevel) => save({ englishLevel })}
          />
        )}
      />
    </Ledger>
  );
}

// Step 2: ways of working -------------------------------------------------

export function WaysRows({ profile, save, labelledBy }: RowsProps & { labelledBy?: string }) {
  const text = useFieldText();
  const options = useOptions();

  return (
    <Ledger labelledBy={labelledBy}>
      <FieldRow
        id={fieldAnchor("waysOfWorking")}
        {...text("waysOfWorking")}
        filled={profile.waysOfWorking.length > 0}
        value={
          <ValueChips
            values={profile.waysOfWorking.map(
              (way) => options.ways.find((o) => o.value === way)?.label ?? way,
            )}
            label={text("waysOfWorking").label}
          />
        }
        editor={() => (
          <MultiChoiceEditor
            legend={text("waysOfWorking").label}
            options={options.ways}
            values={profile.waysOfWorking}
            onChange={(waysOfWorking) => save({ waysOfWorking })}
          />
        )}
      />
      <FieldRow
        id={fieldAnchor("employmentTypes")}
        {...text("employmentTypes")}
        filled={profile.employmentTypes.length > 0}
        value={
          <ValueChips
            values={profile.employmentTypes.map(
              (type) => options.employment.find((o) => o.value === type)?.label ?? type,
            )}
            label={text("employmentTypes").label}
          />
        }
        editor={() => (
          <MultiChoiceEditor
            legend={text("employmentTypes").label}
            options={options.employment}
            values={profile.employmentTypes}
            onChange={(employmentTypes) => save({ employmentTypes })}
          />
        )}
      />
    </Ledger>
  );
}

// Step 3: role and money --------------------------------------------------

export function RoleRows({ profile, save, labelledBy }: RowsProps & { labelledBy?: string }) {
  const text = useFieldText();
  const options = useOptions();
  const values = useTranslations("Onboarding.values");
  const units = useTranslations("Onboarding.units");
  const actions = useTranslations("Onboarding.actions");
  const L = PROFILE_LIMITS;

  const rateFilled =
    profile.minRate !== null && profile.minRateCurrency !== null && profile.minRatePeriod !== null;

  return (
    <Ledger labelledBy={labelledBy}>
      <FieldRow
        id={fieldAnchor("titles")}
        {...text("titles")}
        filled={profile.titles.length > 0}
        value={<ValueChips values={profile.titles} label={text("titles").label} />}
        editor={() => (
          <TextChipsEditor
            legend={text("titles").label}
            placeholder={values("titlePlaceholder")}
            values={profile.titles}
            max={L.titles}
            maxChars={L.titleChars}
            onChange={(titles) => save({ titles })}
          />
        )}
      />
      <FieldRow
        id={fieldAnchor("seniority")}
        {...text("seniority")}
        filled={profile.seniority !== null}
        value={
          profile.seniority
            ? options.seniorities.find((s) => s.value === profile.seniority)?.label
            : null
        }
        editor={() => (
          <ChoiceEditor
            legend={text("seniority").label}
            options={options.seniorities}
            value={profile.seniority}
            clearable
            onChange={(seniority) => save({ seniority })}
          />
        )}
      />
      <FieldRow
        id={fieldAnchor("stack")}
        {...text("stack")}
        filled={profile.stack.length > 0}
        value={<ValueChips values={profile.stack} label={text("stack").label} />}
        editor={() => (
          <TextChipsEditor
            legend={text("stack").label}
            placeholder={values("stackPlaceholder")}
            values={profile.stack}
            max={L.stack}
            maxChars={L.stackChars}
            onChange={(stack) => save({ stack })}
          />
        )}
      />
      <FieldRow
        id={fieldAnchor("minRate")}
        {...text("minRate")}
        filled={rateFilled}
        value={
          rateFilled
            ? units("rate", {
                amount: profile.minRate ?? 0,
                currency: profile.minRateCurrency ?? "",
                period: values(`periods.${profile.minRatePeriod ?? "month"}`),
              })
            : null
        }
        editor={() => (
          <RateEditor
            legend={text("minRate").label}
            amount={profile.minRate}
            currency={profile.minRateCurrency}
            period={profile.minRatePeriod}
            currencies={CURRENCIES}
            periods={options.periods}
            labels={{
              amount: values("rateAmount"),
              currency: values("rateCurrency"),
              period: values("ratePeriod"),
            }}
            onChange={({ amount, currency, period }) =>
              save({
                minRate: amount,
                minRateCurrency: currency,
                minRatePeriod: period as ProfileView["minRatePeriod"],
              })
            }
          />
        )}
      />
      <FieldRow
        id={fieldAnchor("dealbreakers")}
        {...text("dealbreakers")}
        filled={profile.dealbreakers.length > 0}
        value={<ValueChips values={profile.dealbreakers} label={text("dealbreakers").label} />}
        editor={() => (
          <TextChipsEditor
            legend={text("dealbreakers").label}
            placeholder={values("dealbreakerPlaceholder")}
            values={profile.dealbreakers}
            max={L.dealbreakers}
            maxChars={L.dealbreakerChars}
            onChange={(dealbreakers) => save({ dealbreakers })}
          />
        )}
      />
      <FieldRow
        id={fieldAnchor("hideNoSalary")}
        {...text("hideNoSalary")}
        filled
        value={actions(profile.hideNoSalary ? "yes" : "no")}
        editor={() => (
          <YesNoEditor
            legend={text("hideNoSalary").label}
            value={profile.hideNoSalary}
            onChange={(hideNoSalary) => save({ hideNoSalary })}
          />
        )}
      />
    </Ledger>
  );
}

/** Rows a `PermitValue` list can be written back as. */
export type { PermitValue };
