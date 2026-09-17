// Quote quality for LLM eligibility items (review M3). A verbatim quote is not enough: it must be a
// clause that states the rule for its kind, and the sentence around it must not be a perk,
// preference, condition, negation, company description or boilerplate. The sentence filters reuse
// the rules extractor's helpers so both extractors read context the same way. Isomorphic.

import {
  CONDITIONAL_RE,
  NEGATION_RE,
  PREFERENCE_RE,
  clauseBefore,
  isBoilerplate,
  isDescriptive,
  splitSentences,
} from "../rules/text";
import type { EngagementMode } from "../signals";
import type { LlmSignalKind } from "./schema";

/**
 * Local copies of two patterns `rules/extract.ts` keeps private (requested for export from the
 * rules owner). Keep in step with BENEFIT_RE and PERK_RE there.
 */
const BENEFIT_RE =
  /\b(?:time off|PTO|benefits?|stipend|leave|holidays?|insurance|equity|allowance|budget|perks?|coworking|co-working)\b/i;
const PERK_RE =
  /\b(?:up to|for)\s+\d+\s*(?:days|weeks|months)\b|\b\d+\s*(?:days|weeks)\s+(?:a|per|each)\s+year\b|\bworkation\b|\balmost anywhere\b|\bwithin the country of employment\b/i;

/** Phrases with negation words that do not negate the statement. */
const NOT_A_NEGATION_RE =
  /\bno matter\b|\bnot only\b|\bno exceptions?\b|\bno (?:need|requirement) to relocate\b|\bwithout (?:relocating|relocation|the need to relocate)\b|\bwithout (?:the need for |needing |requiring |requirement for )?(?:visa |employer |immigration )?sponsorship\b|\b(?:not|never|n['’]t) (?:now or in the future )?(?:require|need)\w* (?:visa |employer |immigration )?sponsorship\b/gi;

export const MIN_QUOTE_WORDS = 4;

const OFFICE_RE =
  /\b(?:office|on[- ]?site|in[- ]person|in[- ]office|hybrid|days? (?:a|per) week|relocat\w*|commut\w*)\b/i;

const WORLDWIDE_WORD_RE =
  /\b(?:anywhere|worldwide|world|globally|global|globe|any (?:country|countries|location|place|time ?zone)|all countries|every country|regardless of (?:your |their )?location|location[- ]independent|location[- ]agnostic|international(?:ly)?)\b/i;

const KIND_TRIGGERS: Readonly<Record<Exclude<LlmSignalKind, "engagement">, RegExp>> = {
  "allow-list":
    /\b(?:only|must|required?|requires|need(?:s|ed)? to|based|located|living|live|lives|reside\w*|residents?|residency|remote|within|hire|hiring|recruit\w*|open to|available (?:to|in)|eligible|candidates?|applicants?|applications?|restricted|limited|from)\b/i,
  exclude:
    /\b(?:not|cannot|can['’]t|unable|exclud\w*|except|excepting|outside|won['’]t|will not|no longer|ineligible|restricted from|do not|don['’]t)\b/i,
  worldwide: WORLDWIDE_WORD_RE,
  "work-authorization":
    /\b(?:authori[sz]\w*|right to work|work permit|permit to work|visa|eligib\w* to work|legally (?:able|allowed|entitled)|work eligibility|sponsor\w*)\b/i,
  "citizenship-or-clearance":
    /\b(?:citizen\w*|nationals?|nationality|clearance|cleared|ITAR|EAR|export[- ]control\w*|U\.?S\.? persons?|green card|permanent residen\w*|TS\/SCI|secret)\b/i,
  timezone:
    /\b(?:time ?zones?|hours|overlap\w*|UTC|GMT|CET|CEST|EET|EST|EDT|CST|PST|PDT|MST|IST|business day|working day)\b/i,
};

/** Keyed by mode name, so modes the signal contract adds later ("relocation-required") fit. */
const ENGAGEMENT_TRIGGERS: Readonly<Record<EngagementMode | "relocation-required", RegExp>> = {
  "relocation-required": /\brelocat\w*|\bmove to\b|\bmoving to\b/i,
  b2b: /\bB2B\b|\bown (?:company|business|entity)\b|\binvoic\w*/i,
  contractor: /\bcontract(?:or|ors|ing)?\b|\b1099\b|\bindependent\b/i,
  freelance: /\bfreelanc\w*/i,
  eor: /\bemployer of record\b|\bEOR\b|\bDeel\b|\bRemote\.com\b|\bOyster\b|\bRippling\b|\bPapaya\b|\bMultiplier\b|\bVelocity Global\b|\bGlobalization Partners\b|\bOmnipresent\b|\bRemofirst\b/i,
  "contractor-platform":
    /\bDeel\b|\bRemote\.com\b|\bOyster\b|\bRippling\b|\bPapaya\b|\bMultiplier\b|\bVelocity Global\b|\bGlobalization Partners\b|\bOmnipresent\b|\bRemofirst\b|\bUpwork\b|\bToptal\b/i,
  "employee-only": /\bemploy\w*\b|\bpayroll\b|\bW-?2\b|\bnot (?:a )?contract/i,
  "visa-sponsorship": /\bsponsor\w*|\bvisa\w*|\brelocat\w*|\bwork permit\b/i,
  "no-visa-sponsorship": /\bsponsor\w*|\bvisa\w*|\bwork permit\b/i,
};

/** Kinds and modes whose statement is itself negative, so negation wording is expected. */
const NEGATIVE_BY_NATURE = new Set<string>(["exclude", "no-visa-sponsorship", "employee-only"]);

export interface QuoteSentence {
  /** The sentence(s) of the post text overlapping the quote span. */
  text: string;
  /** Offsets of the quote inside `text`. */
  quoteStart: number;
  quoteEnd: number;
}

/** The sentences of `postText` that overlap `[start, end)`, with the quote's offsets inside them. */
export function sentenceAround(postText: string, start: number, end: number): QuoteSentence {
  const overlapping = splitSentences(postText).filter((s) => s.start < end && s.end > start);
  if (overlapping.length === 0) {
    return { text: postText.slice(start, end), quoteStart: 0, quoteEnd: end - start };
  }
  const from = Math.min(overlapping[0]!.start, start);
  const to = Math.max(overlapping[overlapping.length - 1]!.end, end);
  return { text: postText.slice(from, to), quoteStart: start - from, quoteEnd: end - from };
}

export type QuoteVerdict =
  /** The statement stands as the model gave it. */
  | { action: "keep"; weakReasons: string[] }
  /** Negated: the opposite statement (allow-list becomes exclude; sponsorship flips). */
  | { action: "flip"; weakReasons: string[] }
  /** Negated with no safe opposite: drop it. */
  | { action: "drop"; reason: string };

const wordCount = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;
const hasNegation = (text: string) => NEGATION_RE.test(text.replace(NOT_A_NEGATION_RE, " "));

/** The clause after the quote, up to the next clause break, capped at 60 characters. */
function clauseAfter(sentence: string, index: number): string {
  const tail = sentence.slice(index, index + 60);
  const cut = tail.search(/[.;:!?]|\s[-–—]\s|,\s*(?:and|but|while|whereas)\b/);
  return cut >= 0 ? tail.slice(0, cut) : tail;
}

/**
 * Judges one verified quote. `kind` and `mode` are the item's; `quote` is the post's own span and
 * `context` its sentence. Weak reasons downgrade the signal to `weak`. `restriction` skips the
 * length and trigger checks (see `isRestriction`).
 */
export function judgeQuote(
  kind: LlmSignalKind,
  mode: EngagementMode | null,
  quote: string,
  context: QuoteSentence,
  restriction = false,
  /**
   * Skip the length and trigger checks only (not the sentence filters): a positive allow-list
   * quoted from the Locations line or the title ("Locations: Kyiv"), where a short place label is
   * the whole statement (review C2d).
   */
  postedLocation = false,
): QuoteVerdict {
  const weakReasons: string[] = [];
  const checkWording = !restriction && !postedLocation;
  // Length and trigger wording guard positive statements only; restrictions only lower tiers.
  if (checkWording && wordCount(quote) < MIN_QUOTE_WORDS) weakReasons.push("short-quote");

  const trigger =
    kind === "engagement"
      ? mode
        ? (ENGAGEMENT_TRIGGERS as Readonly<Record<string, RegExp>>)[mode]
        : null
      : KIND_TRIGGERS[kind];
  if (checkWording && (!trigger || !trigger.test(quote))) weakReasons.push("no-trigger");

  const sentence = context.text;
  if (PERK_RE.test(sentence)) weakReasons.push("perk");
  if ((kind === "worldwide" || kind === "allow-list") && BENEFIT_RE.test(sentence)) {
    weakReasons.push("benefits");
  }
  if (PREFERENCE_RE.test(sentence)) weakReasons.push("preference");
  const before = clauseBefore(sentence, context.quoteStart);
  if (CONDITIONAL_RE.test(before) || CONDITIONAL_RE.test(quote)) weakReasons.push("conditional");
  // Office and on-site sentences ("based in our New York office") state where the work happens:
  // never company description for restrictions and location statements.
  const officeStatement = kind === "allow-list" && OFFICE_RE.test(sentence);
  if (
    !restriction &&
    !officeStatement &&
    isDescriptive(sentence) &&
    !/\b(?:hire|hiring|candidates?|applicants?|you|your)\b/i.test(sentence)
  ) {
    weakReasons.push("descriptive");
  }
  if (isBoilerplate(sentence)) weakReasons.push("boilerplate");

  const negativeByNature =
    NEGATIVE_BY_NATURE.has(kind) || (mode !== null && NEGATIVE_BY_NATURE.has(mode));
  if (!negativeByNature) {
    const negated =
      hasNegation(before) ||
      hasNegation(quote) ||
      hasNegation(clauseAfter(sentence, context.quoteEnd));
    if (negated) {
      const flippable =
        kind === "allow-list" || (kind === "engagement" && mode === "visa-sponsorship");
      return flippable ? { action: "flip", weakReasons } : { action: "drop", reason: "negated" };
    }
  }
  return { action: "keep", weakReasons };
}

/** Engagement modes that restrict rather than open a way of working. */
const RESTRICTIVE_MODES = new Set<string>([
  "employee-only",
  "no-visa-sponsorship",
  "relocation-required",
]);

/**
 * Restrictions only lower tiers: exclude, work authorization, citizenship or clearance, a required
 * timezone, a "<place> only" or office, on-site or relocation allow-list, and employee-only,
 * no-sponsorship or relocation-required engagement.
 */
export function isRestriction(
  kind: LlmSignalKind,
  mode: EngagementMode | null,
  quote: string,
): boolean {
  if (kind === "exclude" || kind === "work-authorization" || kind === "citizenship-or-clearance") {
    return true;
  }
  if (kind === "timezone") return true;
  // "<place> only" and office, on-site or relocation statements shrink scope: restrictions.
  if (kind === "allow-list") {
    return /\bonly\b/i.test(quote.replace(/\bnot only\b/gi, " ")) || OFFICE_RE.test(quote);
  }
  if (kind === "engagement") return mode !== null && RESTRICTIVE_MODES.has(mode);
  return false;
}

/** Words that make a timezone overlap a requirement rather than a preferred band. */
const OVERLAP_REQUIRED_RE =
  /\b(?:must|required|requires?|requirement|need(?:s|ed)? to|have to|has to|mandatory|non-negotiable|strictly|at least|minimum(?: of)?)\b|\b\d{1,2}\s*\+?\s*(?:-|to)?\s*(?:\d{1,2}\s*)?(?:hours?|hrs?|h)\b/i;

/**
 * "Overlap with CET" with no hours and no requirement word is a preferred band, not a required one
 * (review C2d finding 4). `sentence` is the text around the quote.
 */
export function isPreferredOverlap(sentence: string): boolean {
  return /\boverlap/i.test(sentence) && !OVERLAP_REQUIRED_RE.test(sentence);
}
