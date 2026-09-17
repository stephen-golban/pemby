// The profile as `/onboarding` and `/profile` read and write it (PLAN D5). Isomorphic: this module
// is imported by client components, so it holds no server code and no runtime `@pemby/core` import
// — the value lists below are local copies checked against core's types with `satisfies`, the same
// trick `components/profile/profile-field-list.tsx` uses to keep zod and the eligibility engine out
// of the browser bundle. A value core adds shows up here as a type error until it is listed.

import type { EmploymentType, EnglishLevel, Seniority, WayOfWorking } from "@pemby/core";

export const WAYS_OF_WORKING = [
  "b2b-contractor",
  "eor-employee",
  "relocation-visa",
  "freelance",
  "local",
  "paid-program",
] as const satisfies readonly WayOfWorking[];

export const EMPLOYMENT_TYPES = [
  "full-time",
  "part-time",
  "contract-to-hire",
] as const satisfies readonly EmploymentType[];

export const SENIORITIES = [
  "intern",
  "junior",
  "middle",
  "senior",
  "lead",
  "staff",
  "principal",
] as const satisfies readonly Seniority[];

export const ENGLISH_LEVELS = [
  "a1",
  "a2",
  "b1",
  "b2",
  "c1",
  "c2",
  "native",
] as const satisfies readonly EnglishLevel[];

/** `pay_period` pg enum. Same spelling in the database and in TypeScript. */
export const PAY_PERIODS = ["hour", "day", "month", "year"] as const;
export type PayPeriod = (typeof PAY_PERIODS)[number];

/**
 * Permit kinds offered in the UI. Free text would be unreadable to the matcher and untranslatable,
 * so `profiles.permits[].kind` is constrained to this list on the way in.
 */
export const PERMIT_KINDS = [
  "work-permit",
  "residence-permit",
  "student-permit",
  "working-holiday",
  "other",
] as const;
export type PermitKind = (typeof PERMIT_KINDS)[number];

export type PermitView = { country: string; kind: PermitKind; expiresOn?: string };

/**
 * The word the delete-account confirmation field must hold, exactly. A protocol value, not a
 * message: the UI interpolates it into a translated sentence, so a localized prompt still
 * validates on the server.
 */
export const DELETE_CONFIRMATION = "DELETE";

/** Currencies offered in the picker. Any ISO-4217-shaped code is accepted on the way in. */
export const CURRENCIES = [
  "USD",
  "EUR",
  "GBP",
  "CHF",
  "PLN",
  "RON",
  "MDL",
  "UAH",
  "GEL",
  "AMD",
  "RSD",
  "TRY",
  "INR",
  "BRL",
  "MXN",
  "NGN",
  "KES",
  "ZAR",
] as const;

/** Body of `GET /api/profile` and of a successful `PATCH`. Core spelling throughout. */
export interface ProfileView {
  displayName: string | null;

  // Step 1: eligibility.
  citizenships: string[];
  residenceCountry: string | null;
  timezone: string | null;
  minOverlapHours: number | null;
  hasOwnCompany: boolean;
  permits: PermitView[];
  englishLevel: EnglishLevel | null;

  // Step 2: ways of working.
  waysOfWorking: WayOfWorking[];
  employmentTypes: EmploymentType[];

  // Step 3: role and money.
  titles: string[];
  seniority: Seniority | null;
  stack: string[];
  dealbreakers: string[];
  minRate: number | null;
  minRateCurrency: string | null;
  minRatePeriod: PayPeriod | null;
  hideNoSalary: boolean;

  onboardingCompletedAt: string | null;
  /** True while the session belongs to an anonymous (unclaimed) user; their data expires in 24 h. */
  anonymous: boolean;
}

/** Every key a `PATCH /api/profile` body may carry. */
export type ProfilePatch = Partial<Omit<ProfileView, "onboardingCompletedAt" | "anonymous">>;

export const PROFILE_PATCH_KEYS = [
  "displayName",
  "citizenships",
  "residenceCountry",
  "timezone",
  "minOverlapHours",
  "hasOwnCompany",
  "permits",
  "englishLevel",
  "waysOfWorking",
  "employmentTypes",
  "titles",
  "seniority",
  "stack",
  "dealbreakers",
  "minRate",
  "minRateCurrency",
  "minRatePeriod",
  "hideNoSalary",
] as const satisfies readonly (keyof ProfilePatch)[];

export type ProfilePatchKey = (typeof PROFILE_PATCH_KEYS)[number];

/** Limits the route enforces and the editors pre-check, so an obvious miss costs no round trip. */
export const PROFILE_LIMITS = {
  displayNameChars: 80,
  citizenships: 10,
  titles: 5,
  titleChars: 100,
  stack: 30,
  stackChars: 60,
  dealbreakers: 10,
  dealbreakerChars: 80,
  permits: 10,
  minOverlapHours: 12,
  /** A rate above this is a typo, not a rate. */
  minRate: 10_000_000,
} as const;

// Profile strength -------------------------------------------------------

/**
 * Profile strength: how much of what the matcher actually reads has been answered.
 *
 * The weights are not a guess at importance in the abstract — each one is a column the phase 06
 * gates read (`lib/teaser/sql-source.ts`, `lib/teaser/input.ts`) or a PLAN D6 hard gate that phase
 * 07 will read:
 *
 *   residence country   20  the eligibility scope; with it empty nothing can match at all
 *   ways of working     15  the second half of the eligibility gate (`job_eligibility.way_of_working`)
 *   titles              15  the role-family gate (`lib/teaser/roles.ts`)
 *   seniority           10  the seniority gate, within one level
 *   stack               10  the strongest scoring signal; 3+ entries score full, 1-2 score half
 *   citizenships         5  relocation and visa eligibility
 *   timezone             5  the overlap signal
 *   min overlap hours    5  the overlap gate's floor
 *   English level        5  a language gate on the job side
 *   employment types     5  full-time / part-time / contract-to-hire filtering
 *   minimum rate         5  the salary floor gate (needs amount, currency and period together)
 *                      ---
 *                      100
 *
 * Fields with no "unanswered" state (`hasOwnCompany`, `hideNoSalary`) and fields that only ever
 * narrow the result (`dealbreakers`, `permits`, `displayName`) carry no weight: a profile is not
 * weaker for having nothing to exclude.
 */
export const PROFILE_STRENGTH_WEIGHTS = {
  residenceCountry: 20,
  waysOfWorking: 15,
  titles: 15,
  seniority: 10,
  stack: 10,
  citizenships: 5,
  timezone: 5,
  minOverlapHours: 5,
  englishLevel: 5,
  employmentTypes: 5,
  minRate: 5,
} as const;

export type ProfileStrengthKey = keyof typeof PROFILE_STRENGTH_WEIGHTS;

export const PROFILE_STRENGTH_KEYS = Object.keys(
  PROFILE_STRENGTH_WEIGHTS,
) as readonly ProfileStrengthKey[];

/** Stack counts as fully answered from this many entries; fewer scores half. */
const STACK_FULL = 3;

/** 0, 0.5 or 1 for each weighted field. */
export function profileFieldScore(profile: ProfileView, key: ProfileStrengthKey): number {
  switch (key) {
    case "residenceCountry":
      return profile.residenceCountry ? 1 : 0;
    case "waysOfWorking":
      return profile.waysOfWorking.length > 0 ? 1 : 0;
    case "titles":
      return profile.titles.length > 0 ? 1 : 0;
    case "seniority":
      return profile.seniority ? 1 : 0;
    case "stack":
      if (profile.stack.length >= STACK_FULL) return 1;
      return profile.stack.length > 0 ? 0.5 : 0;
    case "citizenships":
      return profile.citizenships.length > 0 ? 1 : 0;
    case "timezone":
      return profile.timezone ? 1 : 0;
    case "minOverlapHours":
      return profile.minOverlapHours !== null ? 1 : 0;
    case "englishLevel":
      return profile.englishLevel ? 1 : 0;
    case "employmentTypes":
      return profile.employmentTypes.length > 0 ? 1 : 0;
    case "minRate":
      return profile.minRate !== null && profile.minRateCurrency && profile.minRatePeriod ? 1 : 0;
  }
}

/** Whole percent, 0-100. */
export function profileStrength(profile: ProfileView): number {
  let score = 0;
  for (const key of PROFILE_STRENGTH_KEYS) {
    score += PROFILE_STRENGTH_WEIGHTS[key] * profileFieldScore(profile, key);
  }
  return Math.round(score);
}

/** Weighted fields that would add the most, best first: the "what's missing" list on `/profile`. */
export function profileGaps(profile: ProfileView): ProfileStrengthKey[] {
  return PROFILE_STRENGTH_KEYS.filter((key) => profileFieldScore(profile, key) < 1).sort(
    (a, b) => PROFILE_STRENGTH_WEIGHTS[b] - PROFILE_STRENGTH_WEIGHTS[a],
  );
}
