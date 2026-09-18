// The score (PLAN section 4 rule 2, D6). Five components normalised to 0..1, weighted by private
// config, scaled to 0..100, then adjusted by the user's own "Not for me" nudges.
//
// Weights and the match / near-miss thresholds are private config loaded by the caller
// (`loadScoringWeights()` from `@pemby/core/private-config`). Nothing in this public repo holds a
// real weight value, and nothing here has a default weight to fall back on.
//
// A component with no signal is *not* scored as zero. A job with no embedding yet (seed data, or
// anything the embedding worker has not reached) would otherwise fail the threshold for a reason
// that has nothing to do with the job. Instead its weight is spread over the components that do
// have signal, and the absence is reported in `MatchScore.unscored`.
//
// That spreading is right in principle and wrong on its own: give one surviving component the
// entire weight and one perfect sub-signal becomes 100/100, so a post that says almost nothing
// about itself outranks one that says a great deal. So the spread score is also held under a
// **ceiling set by how much evidence it rests on**, and a score resting on fewer than
// `MIN_EVIDENCE_COMPONENTS` components is held under the match threshold outright. In one
// sentence for the person it belongs to: a job can only score as high as the evidence behind it
// allows, and the fewer things Pemby actually knows about a post, the lower that ceiling sits.
//
// A ceiling rather than a multiplier, deliberately. An unknown component is unknown, not bad:
// scaling every score by its evidence would push a weak job lower for a reason that is not the
// job's, on top of the low score it already earned. A ceiling leaves the weak job where its own
// signals put it and stops only the thin-but-perfect one being certified as strong.
//
// **"There was nothing to know" is not "we failed to find out".** The ceiling asks what share of
// the knowable evidence carried signal, so everything turns on which absences are knowable at all.
// A post that states no time-zone band is not withholding one — there is nothing there to compare
// against, and charging the score's ceiling for it would cap every such post for a fact about the
// post rather than about the fit. So every absent component is classified as `not-applicable` or
// `missing` (see the rule above `signals()`), and only `missing` sits in the denominator. Without
// that split the denominator counted absences no signal could ever fill: with `domain` null on
// every pair and `timezoneOverlap` null on nearly every one, evidence topped out at one half and
// the ceiling at exactly the match threshold, so nothing in the product could ever clear the bar.

import type { ScoreComponent, ScoringWeights } from "../private-config/schemas";
import { SCORE_COMPONENTS } from "../private-config/schemas";
import { yearsVerdict } from "../gates/evaluate";
import { differenceBySlug, intersectBySlug, slugSet } from "../matching/normalize";
import { timezoneOverlap } from "../matching/timezone";
import type { MatchJob, MatchUser } from "../matching/types";
import { jobListsSalary } from "../matching/types";
import { SENIORITIES } from "../ways-of-working";
import type { AppliedNudge } from "./nudges";
import { nudgeForJob, toNudgeJob } from "./nudges";
import type { ScoreReason } from "./reasons";

export interface ScoreInput {
  user: MatchUser;
  job: MatchJob;
  /**
   * Cosine similarity in 0..1 between the profile and job embeddings, from pgvector. Null when
   * either side has no embedding yet: the component is then left unscored, never scored as 0.
   *
   * A number outside that range is **not** a similarity of 0 — it is a broken reading, and is
   * treated as `missing` for the same reason null is. See `unitSignal`.
   */
  embeddingSimilarity: number | null;
  /**
   * Company-fit signal in 0..1 from the caller. Null until there is one to compute: company
   * preferences are collected later, in context (PLAN D5), so today this is normally null.
   */
  companyFit?: number | null;
}

/**
 * Why a component carries no value. The two are treated differently by the evidence ceiling and the
 * difference is the whole point of it, so an absence is always one of these and never a bare null:
 *
 * - `not-applicable` — there was nothing to know. The post states no time-zone band, lists no
 *   stack, names no domains; or the product does not compute the component at all. Left out of the
 *   evidence denominator entirely, so it neither raises nor lowers the ceiling.
 * - `missing` — we could have known and did not. The post names domains but the CV yielded none;
 *   the post states a band but we cannot place the user; either side has no embedding yet. Stays in
 *   the denominator and correctly lowers the ceiling.
 */
export type ComponentAbsence = "not-applicable" | "missing";

/** A component's signal: the number it scored, or why there is no number. */
export type ComponentSignal = number | ComponentAbsence;

export interface ScoreComponentResult {
  /** 0..1, or null when there was no signal to score. */
  value: number | null;
  /** Weight actually used, after spreading absent components' weight over the rest. 0 if unscored. */
  weight: number;
  /** Points out of 100 this component contributed. */
  points: number;
  /**
   * Why `value` is null, for a component that scored nothing; absent when it scored. Stored with
   * the rest of this record on the `matches` row, so a reader of one row — the Brief, or a person
   * auditing a verdict — can tell a component the post gave nothing to score from one Pemby should
   * have filled in and did not, without re-running the matcher.
   */
  absence?: ComponentAbsence;
}

/**
 * The share of 100 a score may reach when nothing at all could be scored, and so the floor of the
 * straight line that runs from there up to 100 when every knowable component carried signal.
 *
 * At 0.6 the ladder reads plainly: **every quarter of the evidence Pemby actually has is worth ten
 * points of ceiling** — none of it caps a score at 60, half of it at 80, all of it at 100. The
 * number is a convention, stated here rather than derived, and it was chosen for that legibility
 * and not from any run's numbers; moving it moves every score's ceiling and nothing else.
 *
 * A **code constant, not private config**, deliberately. It is not a weight and not a threshold —
 * this file holds no default for either, and never will — but a property of the scoring *method*,
 * the same kind of stated convention as `WORKDAY_HOURS` next door. It has to be readable to
 * explain a score to the person it belongs to ("this post left two things there to know and Pemby
 * scored one of them, so it is capped"), it says nothing about which signals Pemby values or where
 * the match bar sits, and hiding it in the private config would leave a reader of this repo unable
 * to tell what the rule does at all.
 */
export const EVIDENCE_FLOOR = 0.6;

/**
 * Components that must carry signal before a score may reach the match threshold. One perfect
 * sub-signal is never enough to call something a match, whatever weight that component carries:
 * below this count the ceiling drops to one point under `thresholds.match`, which leaves the job a
 * near miss under the `score` blocker — the honest verdict, and one the Brief already has words
 * for ("Close, but under the score bar"). The threshold itself stays private; it arrives with the
 * weights, and only the comparison lives here.
 *
 * This is the guarantee the evidence ceiling cannot give, and it carries more weight now that
 * `not-applicable` components leave the denominator: a post that states no band, lists no stack and
 * names no domains has *nothing* knowable left but the embedding, so full evidence — and a ceiling
 * of 100 — can rest on that one component. This rule is what stops it, independently of the
 * denominator, and it is why the two rules are separate.
 */
export const MIN_EVIDENCE_COMPONENTS = 2;

/**
 * The generation of this scorer. Stored on every `matches` row the matcher writes, so the product
 * can tell a verdict today's scorer produced from one an older scorer left behind.
 *
 * Bump it whenever a change here would make the same (user, job) pair score differently, or would
 * change which reasons it earns. A bump does not rewrite anything: it marks every existing row as
 * unconfirmed, and the matcher then re-scores what it can reach and retires what it cannot
 * (`retireStaleMatches`). A row is only ever compared against this number, never parsed, so the
 * sequence carries no meaning beyond "newer than".
 *
 * 1 — the first version to carry a marker at all. Its predecessor (recorded as 0, the column
 *     default) treated "this post states no time-zone requirement" as perfect time-zone fit, which
 *     let a job reach 100/100 on one fabricated signal.
 * 2 — split absent components into `not-applicable` and `missing`, and left only `missing` in the
 *     evidence denominator. Version 1 counted "the post states no band" as a hole in the post's
 *     evidence, which on real data pinned every ceiling at the match threshold.
 * 3 — clamped the rounded `total` (and `base`) to `Math.floor(ceiling)`. Version 2 rounded the
 *     total against an unrounded ceiling, so a score could read up to half a point above its own
 *     ceiling and a ceiling of 79.5 could be certified as 80. The same version made `years-short`
 *     defer to the seniority gate's `yearsVerdict`, so a gap this scorer names is one the gate
 *     actually refuses.
 * 4 — stopped reading an unusable similarity as a score of 0. Versions 1 to 3 sent every
 *     caller-supplied ratio through `clamp01`, which turns NaN, a negative cosine similarity and
 *     anything above 1 into 0 — a real number, counted as real evidence, filling the evidence
 *     denominator and a `MIN_EVIDENCE_COMPONENTS` slot on a reading we did not have. The same
 *     version divides `skillOverlap` by the deduplicated stack, so a post naming one technology
 *     three ways no longer scores a user who has it at one third, and the `stack-most` bullet
 *     quotes that same deduplicated total. Both change scores on real pairs; the second also
 *     changes which reasons a pair earns. It follows core's seniority ladder losing its phantom
 *     `staff` rung, which moves the `seniority-step-up` gap for `lead` and `principal` pairs.
 */
export const SCORER_VERSION = 4;

export interface MatchScore {
  /** 0..100, after nudges and clamping. What the threshold is compared against. */
  total: number;
  /** 0..100 before nudges, so the two effects stay separable. */
  base: number;
  components: Readonly<Record<ScoreComponent, ScoreComponentResult>>;
  /**
   * Components with no signal, whatever the reason. Their weight was spread over the rest, not
   * counted as 0. Exactly the union of `notApplicable` and `missing`, which say *why* each one is
   * here; this list stays because "what did not score" is its own question, and it is what
   * `components[key].value === null` enumerates.
   */
  unscored: readonly ScoreComponent[];
  /**
   * Components with nothing to score because there was nothing to know — the post stated no band,
   * listed no stack, named no domains, or the product does not compute the component at all. Left
   * out of the `evidence` denominator, so they neither raise nor lower `ceiling`.
   */
  notApplicable: readonly ScoreComponent[];
  /**
   * Components Pemby could have scored and did not: the gap is on the user's side or in our own
   * pipeline. Counted in the `evidence` denominator, so each one lowers `ceiling`.
   */
  missing: readonly ScoreComponent[];
  /**
   * How much of the picture was actually there: the share of the *knowable* component weight that
   * carried any signal, 0..1. The denominator is every component except the `notApplicable` ones,
   * so 1 means everything there was to know was scored — not that every component scored. This is
   * what sets `ceiling`. 0 when nothing at all was knowable.
   */
  evidence: number;
  /**
   * The highest this score was allowed to reach, 0..100: `EVIDENCE_FLOOR` of 100 when nothing
   * knowable was scored, rising to 100 when everything knowable was, and dropping to one point
   * under the match threshold when fewer than `MIN_EVIDENCE_COMPONENTS` components carried signal.
   *
   * This is the exact, unrounded ceiling; `total` and `base` are whole numbers and are clamped to
   * `Math.floor(ceiling)`, so neither can ever read above the ceiling it was held under. Rounding
   * `total` against an unrounded ceiling used to let a score read up to half a point over — a
   * ceiling of 79.5 rounding up to 80 would certify exactly the match the ceiling existed to stop.
   * A score the evidence rule held down therefore reads as `total === Math.floor(ceiling)`;
   * anything below that is a score its own fit held down, and no amount of extra evidence would
   * raise it.
   */
  ceiling: number;
  /** Points added by the user's nudges (negative lowers the score). */
  nudge: number;
  appliedNudges: readonly AppliedNudge[];
  /** Top 3 templated reasons (PLAN D6). */
  reasons: readonly ScoreReason[];
  /** One templated gap (PLAN D6), or null when there is nothing honest to say. */
  gap: ScoreReason | null;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/**
 * How far outside 0..1 a caller's ratio may land and still be read as that ratio. Float arithmetic
 * on the database side is the only thing this is for: `1 - (a <=> b)` on two identical vectors can
 * come back as 1.0000000000000002, and a perfect match must not be thrown away as unreadable.
 */
const UNIT_TOLERANCE = 1e-6;

/**
 * A caller-supplied 0..1 ratio as a component signal — the one place a number from outside this
 * package is admitted as evidence.
 *
 * `clamp01` alone was not enough, because it maps everything it cannot use to **0**, and 0 is a
 * real score: the component then counts as knowable *and answered*, fills its share of the evidence
 * denominator and its slot against `MIN_EVIDENCE_COMPONENTS`, and lifts the ceiling on the strength
 * of a number that says nothing. That is precisely the "absence read as signal" the evidence
 * ceiling exists to stop, arriving through the ceiling's own front door.
 *
 * The realistic inputs are not hypothetical. pgvector's cosine distance runs over 0..2, so
 * `jobSimilarity`'s `1 - (embedding <=> embedding)` is a 0..1 value only for vectors that are not
 * opposed, and `Number()` over an unexpected column value yields NaN. NaN, Infinity, a negative
 * similarity and anything above 1 all mean the same thing here — we do not have a reading — so they
 * are reported as `missing`, which lowers the ceiling instead of raising it.
 */
function unitSignal(value: number | null): ComponentSignal {
  if (value === null || !Number.isFinite(value)) return "missing";
  if (value < -UNIT_TOLERANCE || value > 1 + UNIT_TOLERANCE) return "missing";
  return clamp01(value);
}

/** The number a component scored, or null when it scored nothing. */
function scoredValue(signal: ComponentSignal): number | null {
  return typeof signal === "number" ? signal : null;
}

interface ComponentSignals {
  values: Record<ScoreComponent, ComponentSignal>;
  matchedStack: string[];
  missingStack: string[];
  /**
   * How many *distinct* technologies the post actually names, after slugging. The denominator
   * `skillOverlap` divides by and the number the `stack-most` bullet quotes, so the fraction the
   * score computes and the fraction the person reads are the same fraction.
   */
  stackSize: number;
  matchedDomains: string[];
  overlapHours: number | null;
  requiredOverlapHours: number | null;
  /**
   * The post states a time-zone band at all. When it does not there is nothing to score and
   * nothing to say: the component is unscored and no reason bullet is offered for it.
   */
  hasTimezoneConstraint: boolean;
}

/**
 * Every component's signal, and for the ones with none, **why** — stated once here, for all five,
 * rather than special-cased per component further down.
 *
 * **The rule.** Ask what is absent, and on whose side:
 *
 * - **Absent on the job side → `not-applicable`.** The post carries nothing to compare against, so
 *   there was never anything for Pemby to find out: it states no time-zone band, lists no stack,
 *   names no domains. Nothing is being hidden and no work of ours is outstanding, so the component
 *   leaves the evidence denominator and the ceiling does not move for it. A component the product
 *   does not compute at all (`companyFit`, whose preferences are collected later and in context —
 *   PLAN D5) is the same case for the same reason: an unbuilt feature must not cap every score in
 *   the product for ever, silently.
 * - **Absent on the user's side, or in our own pipeline → `missing`.** We could have known and did
 *   not: the post names domains but the CV parser produced none, the post states a band but we
 *   cannot place the user, either side has no embedding yet. That is a real hole in the evidence, it
 *   stays in the denominator, and it lowers the ceiling — which is the honest verdict, because the
 *   fix is ours or the user's rather than the post's.
 *
 * **The job side is asked first, everywhere.** If the post says nothing, what the user's side holds
 * cannot matter: there is nothing to compare it against. So a post with no domains is
 * `not-applicable` even for a user whose domains are unknown too.
 */
function signals(input: ScoreInput): ComponentSignals {
  const { user, job } = input;

  const userStack = slugSet(user.stack);
  const matchedStack = intersectBySlug(job.stack, userStack);
  const missingStack = differenceBySlug(job.stack, userStack);
  // The denominator is the *deduplicated* stack, because the numerator is: `intersectBySlug` counts
  // each slug once, so dividing by the raw array let a post spelling one technology three ways
  // ("Node.js", "node js", "NODE.JS") score a user who has it at one third. Posts repeat themselves
  // and enrichment does not always tidy that up; the score should not read a formatting habit as a
  // missing skill. `slugSet` also drops entries that slug to nothing, so a stack of punctuation is
  // correctly nothing to compare rather than a denominator of three.
  const stackSize = slugSet(job.stack).size;
  // Job side: a post listing no stack has nothing to compare a CV against. (A user whose stack is
  // empty is not an absence at all — it scores a real 0 against the stack the post does list.)
  const skillOverlap: ComponentSignal =
    stackSize === 0 ? "not-applicable" : matchedStack.length / stackSize;

  const userDomains = slugSet(user.domains);
  const matchedDomains = intersectBySlug(job.domains, userDomains);
  // Job side first, then ours: a post naming no domains is not applicable, but a post that names
  // them and a CV that yielded none is our parser's hole, and is charged to the ceiling as one.
  const domain: ComponentSignal =
    job.domains.length === 0
      ? "not-applicable"
      : user.domains.length === 0
        ? "missing"
        : matchedDomains.length / job.domains.length;

  const overlap = timezoneOverlap(user, job);
  // A post that states no band scores nothing here. Satisfying a stated constraint comfortably is
  // real signal; the absence of a constraint is not, and used to be the strongest signal there is.
  // The two nulls `timezoneOverlap` returns are different absences, and are classified as such: a
  // post with no band is not applicable, while a stated band we cannot place the user against is
  // missing — the post did its part and we could not do ours.
  const timezone: ComponentSignal =
    overlap === null
      ? "missing"
      : overlap.hours === null
        ? "not-applicable"
        : clamp01(overlap.hours / overlap.requiredHours);

  return {
    values: {
      // Our own pipeline: an embedding either side lacks is work of ours not yet done — and so is
      // one that came back unreadable, which `unitSignal` reports as the same absence.
      embeddingSimilarity: unitSignal(input.embeddingSimilarity),
      skillOverlap,
      domain,
      timezoneOverlap: timezone,
      // `undefined` is "the product has no company-fit facility"; `null` is "it ran and found
      // nothing", which is a hole of ours like any other — as is a number outside 0..1.
      companyFit: input.companyFit === undefined ? "not-applicable" : unitSignal(input.companyFit),
    },
    matchedStack,
    missingStack,
    stackSize,
    matchedDomains,
    overlapHours: overlap?.hours ?? null,
    requiredOverlapHours: overlap?.requiredHours ?? null,
    hasTimezoneConstraint: overlap !== null && overlap.gapHours !== null,
  };
}

function pickReasons(
  s: ComponentSignals,
  components: Record<ScoreComponent, ScoreComponentResult>,
): ScoreReason[] {
  const candidates: Array<{ points: number; reason: ScoreReason }> = [];

  const skill = components.skillOverlap;
  if (skill.value !== null && s.matchedStack.length > 0) {
    candidates.push({
      points: skill.points,
      reason:
        s.missingStack.length === 0
          ? { key: "stack-match", params: { skills: s.matchedStack.slice(0, 3).join(", ") } }
          : {
              key: "stack-most",
              params: {
                matched: String(s.matchedStack.length),
                total: String(s.stackSize),
                skills: s.matchedStack.slice(0, 3).join(", "),
              },
            },
    });
  }

  const domain = components.domain;
  if (domain.value !== null && s.matchedDomains.length > 0) {
    candidates.push({
      points: domain.points,
      reason: { key: "domain-match", params: { domains: s.matchedDomains.slice(0, 2).join(", ") } },
    });
  }

  // Only a *stated* band earns a bullet. `tz.value` is null when the post states none, so there is
  // no longer a branch here for "the post sets no time-zone requirement": that is not a reason.
  const tz = components.timezoneOverlap;
  if (tz.value !== null && tz.value >= 1) {
    candidates.push({
      points: tz.points,
      reason: {
        key: "timezone-overlap",
        params: { hours: String(Math.round(s.overlapHours ?? 0)) },
      },
    });
  }

  const similarity = components.embeddingSimilarity;
  if (similarity.value !== null && similarity.value >= 0.5) {
    candidates.push({
      points: similarity.points,
      reason: { key: "similar-to-your-cv", params: {} },
    });
  }

  const company = components.companyFit;
  if (company.value !== null && company.value >= 0.5) {
    candidates.push({ points: company.points, reason: { key: "company-fit", params: {} } });
  }

  candidates.sort((a, b) => b.points - a.points);
  return candidates.slice(0, 3).map((c) => c.reason);
}

function pickGap(input: ScoreInput, s: ComponentSignals): ScoreReason | null {
  const { user, job } = input;

  if (s.missingStack.length > 0) {
    return { key: "stack-missing", params: { skills: s.missingStack.slice(0, 3).join(", ") } };
  }
  // Only a shortfall the seniority gate itself refuses is a gap. A shortfall inside
  // `YEARS_SHORTFALL_TOLERANCE_YEARS` cleared the gate and is already labelled there by the
  // `years-tolerated` note, so repeating it here would let the copy call a blocker something the
  // gate let through; and unknown years are not a gap at all, because there is no number to be
  // short by. `yearsVerdict` is the gate's own function, so the two cannot drift apart.
  const years = yearsVerdict(user.yearsExperience, job.yearsMin);
  if (years.kind === "short") {
    return {
      key: "years-short",
      params: { years: String(years.yearsMin), userYears: String(years.userYears) },
    };
  }
  if (job.seniority !== null && user.seniority !== null) {
    if (SENIORITIES.indexOf(job.seniority) > SENIORITIES.indexOf(user.seniority)) {
      return {
        key: "seniority-step-up",
        params: { jobSeniority: job.seniority, userSeniority: user.seniority },
      };
    }
  }
  if (
    s.hasTimezoneConstraint &&
    s.overlapHours !== null &&
    s.requiredOverlapHours !== null &&
    s.overlapHours < s.requiredOverlapHours
  ) {
    return {
      key: "timezone-thin",
      params: {
        hours: String(Math.round(s.overlapHours)),
        required: String(Math.round(s.requiredOverlapHours)),
      },
    };
  }
  if (!jobListsSalary(job)) return { key: "salary-not-listed", params: {} };
  if (scoredValue(s.values.embeddingSimilarity) === null) {
    return { key: "no-similarity-yet", params: {} };
  }
  if (job.domains.length > 0 && s.matchedDomains.length === 0) {
    return { key: "domain-new", params: { domains: job.domains.slice(0, 2).join(", ") } };
  }
  return null;
}

/**
 * Scores one (user, job) pair. `weights` come from private config; `nudges` are the user's own
 * stored nudge map (see `applyPassFeedback`). Both the base and the nudged total are returned, with
 * every component's value, effective weight and points, so the result can be stored and shown.
 */
export function scoreMatch(
  input: ScoreInput,
  weights: ScoringWeights,
  nudges: Record<string, number> = {},
): MatchScore {
  const s = signals(input);

  const scored = SCORE_COMPONENTS.filter((key) => typeof s.values[key] === "number");
  const unscored = SCORE_COMPONENTS.filter((key) => typeof s.values[key] !== "number");
  const notApplicable = unscored.filter((key) => s.values[key] === "not-applicable");
  const missing = unscored.filter((key) => s.values[key] === "missing");
  const weightSum = scored.reduce((total, key) => total + weights.components[key], 0);

  // The denominator: everything that was there to be known. A `not-applicable` component is not a
  // hole in this post's evidence — the post carries nothing to compare against, or the product does
  // not compute the component at all — so its weight leaves the denominator rather than counting
  // against the job for ever. A `missing` one stays: that is a hole, and the ceiling should say so.
  // `signals()` above holds the rule that decides which is which.
  const knowableWeight = SCORE_COMPONENTS.filter((key) => !notApplicable.includes(key)).reduce(
    (total, key) => total + weights.components[key],
    0,
  );

  // Evidence: the share of the knowable weight that had anything to say. Every scored component is
  // knowable by construction, so this cannot exceed 1; it is 0 when nothing was knowable at all.
  const evidence = knowableWeight <= 0 ? 0 : clamp01(weightSum / knowableWeight);

  const components = {} as Record<ScoreComponent, ScoreComponentResult>;
  let fit = 0;
  for (const key of SCORE_COMPONENTS) {
    const signal = s.values[key];
    if (typeof signal !== "number") {
      components[key] = { value: null, weight: 0, points: 0, absence: signal };
      continue;
    }
    // Renormalise over the components that do have signal, so an absent one costs nothing.
    const weight = weightSum <= 0 ? 0 : weights.components[key] / weightSum;
    const points = signal * weight * 100;
    components[key] = { value: signal, weight, points };
    fit += points;
  }

  // `fit` says how well the job matches **on what is known**. The ceiling says how much of that
  // Pemby is entitled to claim: it runs from `EVIDENCE_FLOOR` of 100 when nothing knowable was
  // scored up to 100 when everything knowable was, and a score resting on fewer than
  // `MIN_EVIDENCE_COMPONENTS` components is held under the match threshold outright, whatever
  // weight those components carry. The two rules are independent on purpose — a post that leaves
  // almost nothing knowable can reach full evidence on one component, and the second rule is what
  // stops it there. A ceiling, not a multiplier: an unknown component is unknown, not bad, so it
  // must not drag a weak job lower still — it must stop a thin one being certified as strong.
  const evidenceCeiling = 100 * (EVIDENCE_FLOOR + (1 - EVIDENCE_FLOOR) * evidence);
  const thinCeiling =
    scored.length >= MIN_EVIDENCE_COMPONENTS
      ? 100
      : Math.max(0, Math.min(100, weights.thresholds.match - 1));
  const ceiling = Math.min(evidenceCeiling, thinCeiling);
  const base = Math.min(fit, ceiling);

  const { total: nudge, applied } = nudgeForJob(toNudgeJob(input.job), nudges);
  // Round first, then clamp. `total` is the whole number the match threshold is compared against,
  // so the ceiling has to bind *that* number: clamping before rounding let a fractional ceiling of
  // 79.5 produce a total of 80 and certify the very match it was there to prevent. `ceiling` is
  // never negative (`EVIDENCE_FLOOR` is a floor, and the thin-evidence cap is clamped at 0), so
  // flooring it cannot invert the range.
  const cap = Math.floor(ceiling);
  const total = Math.min(cap, Math.round(Math.max(0, base + nudge)));

  return {
    total,
    // Held under the same cap for the same reason, so the two stay comparable on the stored row.
    base: Math.min(cap, Math.round(base)),
    components,
    unscored,
    notApplicable,
    missing,
    evidence,
    ceiling,
    nudge,
    appliedNudges: applied,
    reasons: pickReasons(s, components),
    gap: pickGap(input, s),
  };
}
