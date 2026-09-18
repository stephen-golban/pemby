// One `DueMatch` row turned into the kernel's `MatchCard`.
//
// This is the only place in the dispatcher that turns stored data into words, and even here it does
// not write any: every sentence comes from `GATE_REASONS` or `SCORE_REASONS` through core's own
// renderers, which is what keeps a match reading the same on Telegram, in an email and in the Brief
// (the Brief renders the identical templates out of `apps/web/messages/en/brief.json`).
//
// Three things are worth knowing about the mapping.
//
// **The tier reason is the eligibility gate's own line.** `matches.gate_results` holds one verdict
// per hard gate; the `eligibility` one carries the well-written sentence that explains green or
// yellow, and it is the line a card leads with.
//
// **Params are resolved first.** `resolveReasonParams` turns the data params the engine stores
// (`country` is a bare `MD`) into the words the web gets from `Intl.DisplayNames`. Without it the
// same template reads "yellow for Moldova" on the web and "yellow for MD" on Telegram.
//
// **A key that is not in the table is dropped, not rendered.** `renderGateReason` indexes its table
// directly, so an unknown key — a row written by a newer matcher against an older worker, mid-deploy
// — would throw inside the sender. The stored English (`matches.reasons`, written for exactly this
// reason) is the fallback.
import {
  GATE_REASON_KEYS,
  SCORE_REASON_KEYS,
  asDeliverableTier,
  formatMoney,
  renderGateReason,
  renderScoreReason,
  renderWayLabel,
  resolveReasonParams,
  type GateReasonKey,
  type MatchCard,
  type PayPeriod,
  type ScoreReasonKey,
} from "@pemby/core";
import type { DueMatch } from "@pemby/db";

const gateKeys = new Set<string>(GATE_REASON_KEYS);
const scoreKeys = new Set<string>(SCORE_REASON_KEYS);

const MS_PER_HOUR = 3_600_000;

function gateLine(key: unknown, params: unknown): string | null {
  if (typeof key !== "string" || !gateKeys.has(key)) return null;
  const safe = params && typeof params === "object" ? (params as Record<string, string>) : {};
  return renderGateReason(key as GateReasonKey, resolveReasonParams(safe));
}

function scoreLine(key: unknown, params: unknown): string | null {
  if (typeof key !== "string" || !scoreKeys.has(key)) return null;
  const safe = params && typeof params === "object" ? (params as Record<string, string>) : {};
  return renderScoreReason(key as ScoreReasonKey, resolveReasonParams(safe));
}

/**
 * The eligibility verdict's sentence, or the first verdict that has one.
 *
 * Empty string rather than a thrown error when a row somehow has neither: a card with one line
 * missing is still a usable match, and refusing to send it would turn a data oddity into silence.
 */
function tierReasonOf(due: DueMatch): string {
  const eligibility = due.gateResults.find((g) => g.gate === "eligibility");
  if (eligibility) {
    const line = gateLine(eligibility.reasonKey, eligibility.reasonParams);
    if (line !== null) return line;
  }
  for (const gate of due.gateResults) {
    const line = gateLine(gate.reasonKey, gate.reasonParams);
    if (line !== null) return line;
  }
  return "";
}

/**
 * The score's top reasons: keys where the matcher wrote them (migration 0009 onward), the English
 * it also stored where it did not.
 *
 * The kernel caps the list at three itself; this does not second-guess the order the matcher chose.
 */
function reasonsOf(due: DueMatch): string[] {
  const lines: string[] = [];
  for (const [index, key] of due.reasonKeys.entries()) {
    const line = scoreLine(key, due.reasonParams[index] ?? {});
    if (line !== null) lines.push(line);
  }
  return lines.length > 0 ? lines : due.reasons.filter((r) => r.length > 0);
}

function gapOf(due: DueMatch): string | null {
  const line = scoreLine(due.gapKey, due.gapParams);
  if (line !== null) return line;
  return due.gap !== null && due.gap.length > 0 ? due.gap : null;
}

/**
 * The pay band as a card prints it: `55000-75000 USD/year`, `1000 USD/month`, or null.
 *
 * `formatMoney` from core does each end, so the shape is the one the reason templates already use
 * and no new number formatting is invented here. A band with only one end printed is honest about
 * which end it is only insofar as the template around it is; the kernel prints it as a bare line,
 * which is why a lone maximum is rendered as the maximum and not as a range.
 */
export function formatSalary(
  min: number | null,
  max: number | null,
  currency: string | null,
  period: PayPeriod | null,
): string | null {
  if (currency === null || period === null) return null;
  if (min !== null && max !== null && max > min) {
    const low = Math.round(min);
    const high = formatMoney({ amount: max, currency, period });
    return `${low}-${high}`;
  }
  const amount = min ?? max;
  if (amount === null) return null;
  return formatMoney({ amount, currency, period });
}

/**
 * How old this post is at the moment it is sent, measured from the job's own `first_seen_at`.
 *
 * Exported because `dispatch.ts` needs the same number *before* it builds the card: PLAN D13's note
 * prints this figure, and whether the note belongs on the message at all depends on it being true.
 * One function so the decision and the sentence cannot be computed from different arithmetic.
 */
export function delayHoursOf(due: DueMatch, now: Date): number {
  return Math.max(0, (now.getTime() - due.firstSeenAt.getTime()) / MS_PER_HOUR);
}

export interface CardParams {
  /** Explicit clock, as everywhere in the delivery kernel. */
  now: Date;
  /**
   * PLAN D13. True for a free-tier message that actually waited, which is the only kind that
   * carries the upgrade note. Decided in `dispatch.ts`, from `entitlementsFor` and from the
   * measured delay — never from anything here.
   */
  late: boolean;
}

/**
 * `null` when the row cannot make an honest card. Two cases, neither of which should occur.
 *
 * **A tier a card may not carry.** `matches.tier` is the full four-value enum and `MatchCard.tier`
 * is narrowed to green and yellow, so `asDeliverableTier` is where PLAN D2's "white and red never
 * show" stops being a `where` clause somewhere else and becomes something the compiler enforces at
 * the point a tier turns into a message. `selectDueMatches` already refuses those tiers, so this
 * returns null on a row that cannot exist — which is exactly why it is a guard and not a cast.
 *
 * **No residence country.** The card's headline is the verdict, and the verdict is
 * `TIER_VERDICTS[tier]` with `{country}` filled in — "Hires from Moldova". A profile with no
 * residence country would make that read "Hires from ", and a broken headline is worse than a
 * match that waits. It is also a profile the eligibility gate could not have produced a verdict
 * for, so a match row should not exist for one.
 *
 * `last_verified_live_at` is **not** one of these cases any more: `MatchCard.verifiedLiveAt` is now
 * nullable and the kernel's `renderFreshnessLine` says "not yet confirmed live" rather than
 * printing a NaN, so a post with no reading still makes an honest card.
 *
 * Both nulls are decided before anything is claimed, so nothing is written — which also means
 * nothing bounds them. `maxSkips` retires a match that keeps being *claimed* and skipped; a row
 * that never gets that far is re-selected and re-skipped on every drain, for ever, holding one slot
 * in the overselect. `drainChannel` counts these as `unrenderable` rather than folding them into
 * `skipped`, so the leak is visible in the log line instead of hidden in a total.
 *
 * Bounding them here by claiming first and skipping after was considered and rejected. The tier
 * case is unreachable — `selectDueMatches` already refuses white and red, so a row arriving here
 * with one is corruption, and three `skipped` rows would not fix corruption. The country case *is*
 * reachable, by a user who clears their residence country after their matches were written, and
 * retiring it would permanently silence the channel for every one of that user's existing matches
 * the moment they filled the field back in. The right fix is one predicate in the kernel's
 * selection — `profiles.residence_country is not null`, beside the `is_demo` and pause conditions
 * it already carries — and that file is not this order's. See the report.
 */
export function toMatchCard(due: DueMatch, params: CardParams): MatchCard | null {
  const tier = asDeliverableTier(due.tier);
  if (tier === null) return null;
  if (due.residenceCountry === null) return null;

  return {
    matchId: due.matchId,
    jobId: due.jobId,
    title: due.title,
    company: due.companyName,
    url: due.applyUrl ?? due.url,
    tier,
    // Handed over as the ISO code, deliberately. The kernel resolves it through the same
    // `Intl.DisplayNames` table the Brief reads, so the verdict says "Moldova" and not "MD";
    // resolving it here as well would be resolving it twice.
    country: due.residenceCountry,
    tierReason: tierReasonOf(due),
    reasons: reasonsOf(due),
    gap: gapOf(due),
    salary: formatSalary(due.salaryMin, due.salaryMax, due.salaryCurrency, due.salaryPeriod),
    // The meta line is `company · salary · way of working`, and this is the one segment the card
    // will not word itself: `matches.way_of_working` is a database slug (`b2b_contractor`) and
    // `MatchCard.wayOfWorking` is display text like every other string on it. `renderWayLabel`
    // returns null for a slug the table does not know, and a null segment is dropped rather than
    // rendered empty. It matters to this audience: B2B versus EOR decides whether a role is
    // takeable at all.
    wayOfWorking: renderWayLabel(due.wayOfWorking),
    verifiedLiveAt: due.lastVerifiedLiveAt,
    late: params.late,
    // PLAN D13: how old this post actually is at the moment it is sent, measured from the job's
    // own `first_seen_at`. Never `FREE_DELIVERY_DELAY_HOURS` — that is the floor the dispatcher
    // waits, not a claim about this match, and a job matched two days after it appeared is two
    // days old when it lands.
    delayHours: delayHoursOf(due, params.now),
  };
}
