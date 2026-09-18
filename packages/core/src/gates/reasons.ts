// Reason keys and English fallback text for hard-gate verdicts, in the style of
// `../eligibility/engine/reasons`. Keys are stable and rendered through i18n; the English here is
// the fallback and the reference wording. These are their own table, not the eligibility keys.
//
// PLAN D16 wording: each line says what the post says or what the user chose. None of them says a
// company hires anyone, and none of them uses board, recruiter, placement or auto-apply language.
//
// No line here may depend on grammatical number: `{way}`, `{employment}` and `{accepted}` are
// comma-joined lists, and `renderGateReason` below does naive `{param}` substitution for the
// non-React channels, so ICU plurals cannot be used. Keep every string byte-identical to its twin
// in `apps/web/messages/en/brief.json`.

export const GATE_REASONS = {
  // eligibility (PLAN D2)
  "eligibility-allowed": "The post is {tier} for {country}.",
  "eligibility-blocked": "This role is {tier} for {country}.",
  "eligibility-unknown": "We have no eligibility read for {country} on this post yet.",

  // way of working (PLAN D3)
  "way-accepted": "The post works as {way}, which you accept.",
  "way-not-accepted": "The post works as {way}, which you haven't chosen.",
  "way-unknown": "The post doesn't say how people are engaged.",
  "employment-not-accepted": "The post is {employment}; you asked for {accepted}.",
  "employment-accepted": "The post is {employment}, which you accept.",
  /** The post states no employment type. Said out loud rather than passed over in silence. */
  "employment-unknown": "The post doesn't say whether it's full-time or part-time.",

  // freshness (PLAN D6: 24h)
  "freshness-ok": "Seen live on the company's own board {hours}h ago.",
  "freshness-stale": "Last seen live {hours}h ago; the bar is {limit}h.",
  "freshness-never": "Not yet confirmed live on the company's own board.",

  // seniority (PLAN D6, D11)
  "seniority-match": "The post asks for {jobSeniority}, your level.",
  "seniority-within-one": "The post asks for {jobSeniority}, one level from yours.",
  "seniority-above": "The post asks for {jobSeniority}; you're {userSeniority}.",
  "seniority-below": "The post asks for {jobSeniority}; you're {userSeniority}.",
  "seniority-unknown": "The post doesn't state a level.",
  "years-met": "The post asks {years} years; your CV shows {userYears}.",
  "years-above-tolerance": "The post asks {years} years; your CV shows {userYears}.",
  /** Research 12 section 5 again, for everyone: inside the tolerance, so said plainly, not hidden. */
  "years-tolerated": "The post asks {years} years; your CV shows {userYears}.",
  /** No `years_experience` on the profile. Say we have no number; never report it as a zero. */
  "years-unknown": "The post asks {years} years; your profile doesn't state a number.",
  /** Research 12 section 5: postings inflate entry requirements. Label the gap, don't hide it. */
  "seniority-tolerated-entry": "Asks {years} years; entry-level title.",

  // dealbreakers
  "dealbreaker-none": "None of your dealbreakers show up in the post.",
  "dealbreaker-hit": "The post mentions {dealbreaker}, which you ruled out.",

  // salary
  "salary-at-or-above-floor": "The post lists {salary}, at or above your floor of {floor}.",
  "salary-below-floor": "The post lists {salary}; your floor is {floor}.",
  "salary-no-floor": "You haven't set a rate floor.",
  "salary-not-listed": "The post doesn't list pay.",
  "salary-missing-hidden": "The post doesn't list pay and you've hidden those.",
  "salary-listed": "The post lists pay.",
  /** The post's own ceiling is under the floor: a real comparison, and a definite one. */
  "salary-max-below-floor": "The post lists up to {salary}; your floor is {floor}.",
  /** Only a top of range. Nothing was compared, and the line says so rather than implying a fit. */
  "salary-upper-bound-only":
    "The post lists up to {salary} and no minimum, so your floor of {floor} wasn't checked.",
  /** No rate, no comparison. Unchecked is not the same as met, and this line never says it is. */
  "salary-currency-unconverted":
    "We couldn't convert {currency}, so this post's pay wasn't checked against your floor.",

  // hard rejection, not a gate (PLAN D11)
  "asks-candidate-for-money": "The post asks the candidate for money.",
} as const;

export type GateReasonKey = keyof typeof GATE_REASONS;
export const GATE_REASON_KEYS = Object.keys(GATE_REASONS) as GateReasonKey[];

/** A key plus the values it fills. Never a rendered sentence. */
export interface GateReason {
  key: GateReasonKey;
  params: Record<string, string>;
}

/** Same cap as the eligibility engine, so gate and tier lines sit together without reflowing. */
export const MAX_GATE_REASON = 120;

/** English fallback rendering. The UI normally renders `key` + `params` through i18n instead. */
export function renderGateReason(key: GateReasonKey, params: Record<string, string>): string {
  const text = GATE_REASONS[key].replace(/\{(\w+)\}/g, (_, name: string) => params[name] ?? "");
  return text.length <= MAX_GATE_REASON
    ? text
    : `${text.slice(0, MAX_GATE_REASON - 3).trimEnd()}...`;
}
