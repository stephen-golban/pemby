// The hard gates (PLAN D6), as one pure pass over plain data.
//
// Every gate is always evaluated, so `GateResults` is a complete record and the caller can show
// why a job did or did not clear the bar. The near-miss rule (PLAN section 4.6) needs to know when
// exactly one gate failed, so `GateOutcome.soleFailure` answers that in the same pass.
//
// Not gates, on purpose:
// - Time-zone overlap is a score component, not a gate; `match_gate` has no value for one.
// - Role family is a SQL pre-filter (`compatibleFamilies` in ../roles), not a gate.
// - A post that asks the candidate for money is a hard rejection that is *not* a gate: it must not
//   become a near miss either (PLAN D11), so it is surfaced as `GateOutcome.rejected`.
// - A post at a tier that never shows (white or red, PLAN D2 as amended) is a hard rejection for
//   the same reason and by the same route. Failing the eligibility gate is not enough: one failed
//   gate is the near-miss condition, so a red post that cleared everything else used to be written
//   as a near miss and named in the Brief. "Never show" has to be enforced in the outcome, not left
//   to a caller's constant.

import type { EligibilityTier } from "../eligibility";
import type { CurrencyRates } from "../matching/money";
import type { Money } from "../matching/money";
import { convertMoney, formatMoney } from "../matching/money";
import { slugSet } from "../matching/normalize";
import type { MatchJob, MatchUser } from "../matching/types";
import { jobListsSalary } from "../matching/types";
import { slug } from "../matching/normalize";
import { SENIORITIES } from "../ways-of-working";
import type { HardGate } from "./enums";
import { HARD_GATES } from "./enums";
import type { GateReason, GateReasonKey } from "./reasons";

/** PLAN D6: verified live in the last 24h. */
export const FRESHNESS_HOURS = 24;

/**
 * Research 12 section 5: entry-level postings inflate their experience ask, so a user at intern or
 * junior still clears a post asking up to this many years — labelled, never hidden.
 */
export const JUNIOR_TOLERANCE_YEARS = 2;

/**
 * How many years short of a post's stated `years_min` **anyone** — not only juniors — may fall and
 * still clear this gate, labelled rather than hidden.
 *
 * PLAN D6 states the hard gate as "seniority within one level (tolerant for juniors)" and states no
 * separate years bar at all. Research 12 section 5, which the plan cites, says what the years check
 * is for: "Keep the match bar strict on eligibility and loosen it on experience. ... Experience
 * should tolerate stated requirements up to about 2 years ... because postings inflate them. Label
 * the gap honestly ... rather than hiding the job." Two years is the figure that research names, so
 * two years is the figure here; the labelling half of that sentence is the `years-tolerated` note.
 *
 * A **property of the method, not private config**, like `SENIORITY_DISTANCE` and
 * `JUNIOR_TOLERANCE_YEARS` beside it. It says nothing about which signals Pemby values or where the
 * match bar sits, and a reader of this repo has to be able to see what the gate actually does.
 * Tunable with the owner at a checkpoint, which is why it is one named number and not a literal.
 */
export const YEARS_SHORTFALL_TOLERANCE_YEARS = 2;

/** PLAN D6: seniority within one level by index in `SENIORITIES`. */
export const SENIORITY_DISTANCE = 1;

/** With the tolerance above, an entry-level user may also clear a post two levels up. */
export const JUNIOR_SENIORITY_DISTANCE = 2;

export interface GateResult {
  gate: HardGate;
  passed: boolean;
  /** Stable key rendered through i18n; never a rendered English string. */
  reasonKey: GateReasonKey;
  reasonParams: Record<string, string>;
  /** Caveats worth showing beside the verdict: junior tolerance applied, currency not converted. */
  notes: readonly GateReason[];
}

export type GateResults = Readonly<Record<HardGate, GateResult>>;

/**
 * A reason to drop the job entirely, which is not one of the gates.
 *
 * - `asks-candidate-for-money` — PLAN D11.
 * - `never-shown-tier` — the job's eligibility tier is white or red (PLAN D2 amended 2026-09-17:
 *   "White and red never show"). A tier that must never reach anyone is refused here, where it
 *   cannot be reclassified as a near miss, rather than merely failing the eligibility gate.
 */
export interface GateRejection {
  kind: "asks-candidate-for-money" | "never-shown-tier";
  reasonKey: GateReasonKey;
  reasonParams: Record<string, string>;
}

export interface GateOutcome {
  /** True only when every gate passed and nothing rejected the job outright. */
  passed: boolean;
  results: GateResults;
  /** Every gate that failed, in `HARD_GATES` order. */
  failed: readonly HardGate[];
  /**
   * The one gate that failed, when exactly one did: the near-miss condition (PLAN section 4.6).
   * Always null for a rejected job, so a money-ask post can never be grouped under a blocker.
   */
  soleFailure: HardGate | null;
  /**
   * Non-null means: drop the job. Not a match, not a near miss, nothing shown (PLAN D11, D2). The
   * caller has one decision to make about it — drop — and `GateRejection.kind` says why, for a log
   * line or a tally, never for the person.
   */
  rejected: GateRejection | null;
}

export interface GateInput {
  user: MatchUser;
  job: MatchJob;
  /**
   * Tiers the entitlements module allows for this user (PLAN section 5 owns that decision).
   * `white` and `red` are stripped here whatever the caller passes, because white and red never
   * show (PLAN D2 amended 2026-09-17). A tier that must never be shown is made impossible to show
   * rather than left to the caller to get right.
   */
  allowedTiers: readonly EligibilityTier[];
  /** Explicit clock. This package never calls `Date.now()`. */
  now: Date;
  /** Defaults to `FRESHNESS_HOURS` (24, PLAN D6). */
  freshnessHours?: number;
  /** Rates for the salary gate. A missing rate means "not converted", never a guessed comparison. */
  currencyRates?: CurrencyRates;
}

const HOUR_MS = 60 * 60 * 1000;

function ok(
  gate: HardGate,
  reasonKey: GateReasonKey,
  reasonParams: Record<string, string> = {},
  notes: readonly GateReason[] = [],
): GateResult {
  return { gate, passed: true, reasonKey, reasonParams, notes };
}

function fail(
  gate: HardGate,
  reasonKey: GateReasonKey,
  reasonParams: Record<string, string> = {},
  notes: readonly GateReason[] = [],
): GateResult {
  return { gate, passed: false, reasonKey, reasonParams, notes };
}

function list(values: readonly string[]): string {
  return values.join(", ");
}

/**
 * Tiers that never reach a user, whatever the caller allows (PLAN D2 amended 2026-09-17: "White and
 * red never show").
 *
 * Read twice, on purpose. Stripped from `allowedTiers` inside the gate, because trusting every
 * caller to filter is the mistake this list exists to prevent; and checked against the *job's* own
 * tier in `evaluateGates`, where it produces a `GateRejection` rather than a failed gate. The
 * second read is the one that matters: a failed gate is the near-miss condition, so without it a
 * red post that cleared the other six was written to `matches` as a near miss and shown by title.
 */
const NEVER_SHOWN_TIERS: readonly EligibilityTier[] = ["white", "red"];

function eligibilityGate(input: GateInput): GateResult {
  const gate: HardGate = "eligibility";
  const country = input.user.residenceCountry ?? "";
  const allowed = input.allowedTiers.filter((tier) => !NEVER_SHOWN_TIERS.includes(tier));
  const tier = input.job.tier;
  if (tier === null) return fail(gate, "eligibility-unknown", { country });
  if (!NEVER_SHOWN_TIERS.includes(tier) && allowed.includes(tier)) {
    return ok(gate, "eligibility-allowed", { tier, country });
  }
  return fail(gate, "eligibility-blocked", { tier, country });
}

function wayOfWorkingGate(input: GateInput): GateResult {
  const gate: HardGate = "way-of-working";
  const { user, job } = input;

  // Employment type shares this gate: `match_gate` has no separate value and the fix ("also show
  // part-time") sits in the same one-tap group. The reason key still says which one failed.
  const jobEmployment = job.employmentTypes;
  const userEmployment = user.employmentTypes;
  const employmentShared =
    jobEmployment.length === 0 || userEmployment.length === 0
      ? null
      : jobEmployment.filter((type) => userEmployment.includes(type));

  if (employmentShared !== null && employmentShared.length === 0) {
    return fail(gate, "employment-not-accepted", {
      employment: list(jobEmployment),
      accepted: list(userEmployment),
    });
  }
  // Employment type is a *preference*, not a statement about whether the company can engage this
  // person at all, so an unstated one is labelled rather than refused: failing every post that does
  // not say "full-time" would empty a Brief over a fact that costs a reader one line to check. The
  // label is only offered for the post's own silence — when the user has named no types, their
  // silence means they accept any, and there is nothing to caveat about the post.
  const employmentNote: readonly GateReason[] =
    jobEmployment.length === 0
      ? [{ key: "employment-unknown", params: {} }]
      : employmentShared && employmentShared.length > 0
        ? [{ key: "employment-accepted", params: { employment: list(employmentShared) } }]
        : [];

  // The way of working is the other half, and it is not a preference: it is the claim that this
  // company can engage this person from this country at all, which is the whole product. A post
  // that names none has not made that claim, so the gate does not make it on the post's behalf — it
  // fails closed, and the job becomes a near miss the person can see rather than a silent pass.
  //
  // Unreachable today: both `evaluatePair` call sites fill `wayOfWorking` from the matched
  // `job_eligibility` row. That is exactly why it is worth closing now, while the cost is zero.
  const candidates = job.wayOfWorking ? [job.wayOfWorking] : job.waysOfWorking;
  if (candidates.length === 0) return fail(gate, "way-unknown", {}, employmentNote);

  const shared = candidates.filter((way) => user.waysOfWorking.includes(way));
  if (shared.length === 0) {
    return fail(gate, "way-not-accepted", { way: list(candidates) }, employmentNote);
  }
  return ok(gate, "way-accepted", { way: list(shared) }, employmentNote);
}

function freshnessGate(input: GateInput): GateResult {
  const gate: HardGate = "freshness";
  const limit = input.freshnessHours ?? FRESHNESS_HOURS;
  const verified = input.job.lastVerifiedLiveAt;
  if (verified === null) return fail(gate, "freshness-never", { limit: String(limit) });
  const hours = (input.now.getTime() - verified.getTime()) / HOUR_MS;
  const shown = String(Math.max(0, Math.round(hours)));
  if (hours > limit) return fail(gate, "freshness-stale", { hours: shown, limit: String(limit) });
  return ok(gate, "freshness-ok", { hours: shown, limit: String(limit) });
}

function isEntryLevel(user: MatchUser): boolean {
  if (user.seniority === "intern" || user.seniority === "junior") return true;
  // A stated level is the first signal; failing that, a stated *number* of years under two. An
  // unstated number is not a zero, so a profile with neither is not entry level by default — it is
  // simply unknown, and `yearsVerdict` below handles it as such.
  const years = user.yearsExperience;
  return user.seniority === null && years !== null && years <= 1;
}

/**
 * How the user's years of experience stand against a post's stated minimum.
 *
 * Exported and used by the score as well as by the gate (`pickGap` in ../scoring/score.ts), because
 * the two must never disagree: a job this tolerance lets through must not then be described to the
 * person as short on years.
 *
 * - `not-stated` — the post asks for no particular number of years.
 * - `user-unknown` — **we have no number for the user**, which is not the same as zero and is no
 *   longer treated as zero. A profile with no `years_experience` (someone who onboarded without a
 *   CV, or whose CV parse yielded no figure) used to be judged as having zero years and so failed
 *   every post that stated any requirement at all, silently emptying their Brief. There is nothing
 *   to compare, so the comparison does not happen: the seniority *level* check is the signal we
 *   actually have and it has already had its say, and the absence is surfaced as `years-unknown`
 *   rather than filled in with a figure the user never gave us. Erring open here is also the
 *   direction research 12 section 5 asks for — strict on eligibility, loose on experience — and the
 *   person is told what we do not know instead of being shown nothing at all.
 * - `met` / `tolerated` / `short` — a real comparison, split at `YEARS_SHORTFALL_TOLERANCE_YEARS`.
 */
export type YearsVerdict =
  | { kind: "not-stated" }
  | { kind: "user-unknown"; yearsMin: number }
  | { kind: "met"; yearsMin: number; userYears: number }
  | { kind: "tolerated"; yearsMin: number; userYears: number; shortfall: number }
  | { kind: "short"; yearsMin: number; userYears: number; shortfall: number };

export function yearsVerdict(userYears: number | null, yearsMin: number | null): YearsVerdict {
  if (yearsMin === null) return { kind: "not-stated" };
  if (userYears === null) return { kind: "user-unknown", yearsMin };
  const shortfall = yearsMin - userYears;
  if (shortfall <= 0) return { kind: "met", yearsMin, userYears };
  if (shortfall <= YEARS_SHORTFALL_TOLERANCE_YEARS) {
    return { kind: "tolerated", yearsMin, userYears, shortfall };
  }
  return { kind: "short", yearsMin, userYears, shortfall };
}

function seniorityGate(input: GateInput): GateResult {
  const gate: HardGate = "seniority";
  const { user, job } = input;
  const notes: GateReason[] = [];
  const entry = isEntryLevel(user);
  const yearsMin = job.yearsMin;
  const userYears = user.yearsExperience;

  const withinTolerance = yearsMin !== null && yearsMin <= JUNIOR_TOLERANCE_YEARS;

  // Level: within one index either way, or two upward for an entry-level user whose post asks no
  // more than the tolerance (research 12 section 5).
  if (job.seniority !== null && user.seniority !== null) {
    const jobIndex = SENIORITIES.indexOf(job.seniority);
    const userIndex = SENIORITIES.indexOf(user.seniority);
    const distance = jobIndex - userIndex;
    const maxUp =
      entry && (yearsMin === null || withinTolerance)
        ? JUNIOR_SENIORITY_DISTANCE
        : SENIORITY_DISTANCE;
    if (distance > maxUp) {
      return fail(gate, "seniority-above", {
        jobSeniority: job.seniority,
        userSeniority: user.seniority,
      });
    }
    if (-distance > SENIORITY_DISTANCE) {
      return fail(gate, "seniority-below", {
        jobSeniority: job.seniority,
        userSeniority: user.seniority,
      });
    }
    if (distance > SENIORITY_DISTANCE) {
      notes.push({
        key: "seniority-tolerated-entry",
        params: { years: String(yearsMin ?? 0), jobSeniority: job.seniority },
      });
    }
  }

  // Years: the part postings inflate. `yearsVerdict` owns the whole comparison so that the score's
  // `years-short` gap cannot describe a job this gate just let through (see ../scoring/score.ts).
  const years = yearsVerdict(userYears, yearsMin);
  const statesLevel = job.seniority !== null;

  // The junior allowance is untouched and is still the more generous of the two: an entry-level
  // user clears a post asking no more than `JUNIOR_TOLERANCE_YEARS` whatever the shortfall, and
  // keeps its own "entry-level title" label. With today's numbers it can only ever coincide with
  // the general tolerance, but it is the rule PLAN D6 states rather than a consequence of the
  // number beside it, so it stays stated.
  const juniorAllowance = entry && withinTolerance;

  if (years.kind === "short" && !juniorAllowance) {
    return fail(gate, "years-above-tolerance", {
      years: String(years.yearsMin),
      userYears: String(years.userYears),
    });
  }

  if (years.kind === "tolerated" || years.kind === "short") {
    if (juniorAllowance) {
      notes.push({
        key: "seniority-tolerated-entry",
        params: { years: String(years.yearsMin), userYears: String(years.userYears) },
      });
    } else if (statesLevel) {
      // A post that states no level makes this the gate's whole verdict below, so it is not also
      // repeated as a note.
      notes.push({
        key: "years-tolerated",
        params: { years: String(years.yearsMin), userYears: String(years.userYears) },
      });
    }
  } else if (years.kind === "user-unknown" && statesLevel) {
    notes.push({ key: "years-unknown", params: { years: String(years.yearsMin) } });
  }

  // `job.seniority === null` rather than `!statesLevel`: only the comparison narrows the type.
  if (job.seniority === null) {
    switch (years.kind) {
      case "not-stated":
        return ok(gate, "seniority-unknown", {}, notes);
      case "user-unknown":
        // Never "your CV shows 0": we do not have the number, and say so.
        return ok(gate, "years-unknown", { years: String(years.yearsMin) }, notes);
      default:
        return ok(
          gate,
          years.kind === "met" ? "years-met" : "years-tolerated",
          { years: String(years.yearsMin), userYears: String(years.userYears) },
          notes,
        );
    }
  }
  const same = user.seniority !== null && user.seniority === job.seniority;
  return ok(
    gate,
    same ? "seniority-match" : "seniority-within-one",
    { jobSeniority: job.seniority, userSeniority: user.seniority ?? "" },
    notes,
  );
}

function dealbreakerGate(input: GateInput): GateResult {
  const gate: HardGate = "dealbreaker";
  const { user, job } = input;
  if (user.dealbreakers.length === 0) return ok(gate, "dealbreaker-none");

  // Dealbreakers are free text; the job side is structured. Compare slugs against every structured
  // field a dealbreaker can plausibly name. Free-text post body is not available here on purpose.
  const haystack = slugSet([
    ...job.stack,
    ...job.domains,
    ...job.redFlags,
    ...job.waysOfWorking,
    ...job.employmentTypes,
    ...(job.roleFamily ? [job.roleFamily] : []),
  ]);
  for (const dealbreaker of user.dealbreakers) {
    const key = slug(dealbreaker);
    if (key.length > 0 && haystack.has(key)) {
      return fail(gate, "dealbreaker-hit", { dealbreaker });
    }
  }
  return ok(gate, "dealbreaker-none");
}

/**
 * Pay against the user's stated floor (PLAN D6: "salary at or above the floor when listed").
 *
 * **This gate passes only when a comparison actually happened.** It used to pass whenever one could
 * not, which is the one outcome the person cannot afford: every gate passing is what makes a job a
 * match, and a match is read as "this clears everything you asked for, including your floor". Two
 * routes led there, and both are closed here.
 *
 * *No usable rate.* `convertMoney` refuses to guess, and nothing supplies rates today, so **every**
 * cross-currency pair took the pass branch: a EUR 3,000/month floor cleared a post paying USD
 * 500/month. Passing-on-unconvertible was meant as "never fail someone's floor on a guessed rate",
 * and that instinct is right — the guess is what must not happen. The conclusion was wrong: an
 * unchecked floor is not a met floor, and the honest place for a job whose pay we could not read is
 * the near-miss group, where it is still shown, still named, and carries a line saying plainly that
 * the comparison did not happen. A failed gate here hides nothing that a passed gate would have
 * shown — it moves the job from "match" to "near miss" and tells the truth about why. (The real
 * repair is to supply `currencyRates`; until a caller does, this is what honesty costs.)
 *
 * *Only an upper bound.* A post stating `salaryMax` and no `salaryMin` has not said what it pays.
 * Comparing on the top of the range, and then quoting the employer's maximum back as "the post
 * lists {salary}, at or above your floor", is the same false claim with better formatting. The one
 * thing a ceiling does prove is the negative: a maximum under the floor cannot clear it, and that
 * is a real refusal with a real number behind it. Above the floor, nothing has been established.
 */
function salaryGate(input: GateInput): GateResult {
  const gate: HardGate = "salary";
  const { user, job } = input;
  if (!jobListsSalary(job)) return ok(gate, "salary-not-listed");
  if (user.minRate === null || user.minRateCurrency === null || user.minRatePeriod === null) {
    return ok(gate, "salary-no-floor");
  }

  // `salaryMin` first and `salaryMax` only as a bound, never as the offer: `statesMin` is what
  // decides whether the number below is a figure the post commits to or merely its ceiling.
  const statesMin = job.salaryMin !== null;
  const amount = job.salaryMin ?? job.salaryMax;
  const currency = job.salaryCurrency;
  const period = job.salaryPeriod;
  if (amount === null || currency === null || period === null) return ok(gate, "salary-not-listed");

  const floor: Money = {
    amount: user.minRate,
    currency: user.minRateCurrency,
    period: user.minRatePeriod,
  };
  const listed: Money = { amount, currency, period };
  // Both a ready-made string for the English fallback and the parts, so the UI can format money
  // itself rather than re-parsing a sentence.
  const params = {
    salary: formatMoney(listed),
    salaryAmount: String(amount),
    salaryCurrency: currency.toUpperCase(),
    salaryPeriod: period,
    floor: formatMoney(floor),
    floorAmount: String(floor.amount),
    floorCurrency: floor.currency.toUpperCase(),
    floorPeriod: floor.period,
  };

  const converted = convertMoney(listed, floor, input.currencyRates);
  if (!converted.ok) {
    // Still no guessed rate, and now no claim either: unchecked is reported as unchecked.
    return fail(gate, "salary-currency-unconverted", { ...params, currency: converted.currency });
  }
  if (converted.amount < floor.amount) {
    return fail(gate, statesMin ? "salary-below-floor" : "salary-max-below-floor", params);
  }
  // Above the floor on a figure the post commits to is the only pass this gate has.
  if (!statesMin) return fail(gate, "salary-upper-bound-only", params);
  return ok(gate, "salary-at-or-above-floor", params);
}

function salaryMissingGate(input: GateInput): GateResult {
  const gate: HardGate = "salary-missing";
  if (jobListsSalary(input.job)) return ok(gate, "salary-listed");
  if (input.user.hideNoSalary) return fail(gate, "salary-missing-hidden");
  return ok(gate, "salary-not-listed");
}

/**
 * Runs every hard gate once and reports, in one pass: whether all of them passed, each gate's
 * result, which gates failed, the single failure that makes a near miss, and whether the job must
 * be dropped outright.
 */
export function evaluateGates(input: GateInput): GateOutcome {
  const results: GateResults = {
    eligibility: eligibilityGate(input),
    "way-of-working": wayOfWorkingGate(input),
    freshness: freshnessGate(input),
    seniority: seniorityGate(input),
    dealbreaker: dealbreakerGate(input),
    salary: salaryGate(input),
    "salary-missing": salaryMissingGate(input),
  };

  const failed = HARD_GATES.filter((gate) => !results[gate].passed);
  const tier = input.job.tier;
  const rejected: GateRejection | null = input.job.asksCandidateForMoney
    ? {
        kind: "asks-candidate-for-money",
        reasonKey: "asks-candidate-for-money",
        reasonParams: {},
      }
    : tier !== null && NEVER_SHOWN_TIERS.includes(tier)
      ? {
          kind: "never-shown-tier",
          reasonKey: "eligibility-blocked",
          reasonParams: { tier, country: input.user.residenceCountry ?? "" },
        }
      : null;

  return {
    passed: rejected === null && failed.length === 0,
    results,
    failed,
    soleFailure: rejected === null && failed.length === 1 ? (failed[0] ?? null) : null,
    rejected,
  };
}
