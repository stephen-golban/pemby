// Sentence splitting and context filters for the rules extractor. Isomorphic.

import { findPlaceMentions, isUsStateAbbreviation } from "../regions/match";
import { hasRestrictionCueAndPlace } from "./unaccounted";

export interface Sentence {
  text: string;
  /** Offset of `text` in the field it came from. */
  start: number;
  end: number;
}

const ABBREVIATIONS = new Set([
  "u.s",
  "e.g",
  "i.e",
  "etc",
  "inc",
  "ltd",
  "co",
  "corp",
  "st",
  "jr",
  "sr",
  "vs",
  "approx",
  "no",
  "dr",
  "mr",
  "ms",
  "mrs",
  "u.k",
  "u.a.e",
  "a.m",
  "p.m",
  "incl",
  "min",
  "max",
  "est",
  "d.c",
]);

/** B4: a line ending mid-phrase ("must be located in the") continues on the next line. */
const DANGLING_END_RE = /\b(?:the|in|of|one of|from|within|a|an)\s*$/i;

/** B4: a label line without a colon ("Location", "Eligible countries") followed by places. */
const LABEL_LINE_RE =
  /^(?:locations?|countries|country|regions?|eligible (?:countries|locations|regions|states)|hiring (?:countries|locations|regions)|candidate location|work location|location requirements?|excluded (?:countries|locations|regions)|restricted (?:countries|locations|regions))$/i;

const BULLET_PREFIX_RE = /^[\s*•·▪◦\-–—]+/;

/** A list line that holds only places ("• United States", "- Ukraine (remote)", "AZ, CA, TX"). */
function isPlaceOnlyLine(line: string): boolean {
  const body = line.replace(BULLET_PREFIX_RE, "").trim();
  if (!body || body.length > 80) return false;
  const mentions = findPlaceMentions(body);
  let rest = body;
  for (const mention of [...mentions].reverse()) {
    rest = `${rest.slice(0, mention.start)} ${rest.slice(mention.end)}`;
  }
  let codes = 0;
  rest = rest.replace(/\b[A-Z]{2}\b/g, (code) => {
    if (!isUsStateAbbreviation(code)) return code;
    codes += 1;
    return " ";
  });
  if (mentions.length === 0 && codes === 0) return false;
  return /^[\s,;/&()|.:\-–—]*(?:(?:and|or|only|remote|hybrid|on-?site|the|any|all|states?|provinces?)[\s,;/&()|.:\-–—]*)*$/i.test(
    rest,
  );
}

/**
 * Splits text into sentences with offsets. Lines (paragraphs, list items) are hard breaks; inside a
 * line a period, question or exclamation mark followed by a space and a capital, digit, bullet or
 * quote ends a sentence, unless the word before is a known abbreviation ("U.S.", "e.g.") or a single
 * capital ("J. Smith"). Leading list bullets are dropped from the sentence.
 *
 * B4: lines are joined when a list or phrase runs over them: a line ending in ":" (or a bare label
 * such as "Location") takes the place-only lines that follow ("Must be based in one of:\n• United
 * States\n• Canada"), and a line ending mid-phrase ("located in the") takes the next line.
 */
export function splitSentences(text: string): Sentence[] {
  const sentences: Sentence[] = [];
  const push = (start: number, end: number) => {
    let s = start;
    let e = end;
    while (s < e && /[\s*•·▪◦\-–—]/.test(text[s] ?? "")) s += 1;
    while (e > s && /\s/.test(text[e - 1] ?? "")) e -= 1;
    if (e > s) sentences.push({ text: text.slice(s, e), start: s, end: e });
  };
  const lines: Array<{ start: number; end: number; text: string }> = [];
  let offset = 0;
  for (const line of text.split("\n")) {
    lines.push({ start: offset, end: offset + line.length, text: line });
    offset += line.length + 1;
  }
  let i = 0;
  while (i < lines.length) {
    let j = i;
    for (;;) {
      const current = (lines[j] as (typeof lines)[number]).text.trim();
      const next = lines[j + 1];
      if (!next || next.text.trim() === "") break;
      const label = LABEL_LINE_RE.test(current.replace(BULLET_PREFIX_RE, ""));
      if (/:$/.test(current) || label) {
        if (!isPlaceOnlyLine(next.text)) break;
        j += 1;
        while (lines[j + 1] && isPlaceOnlyLine((lines[j + 1] as (typeof lines)[number]).text))
          j += 1;
        break;
      }
      if (!/[.!?:;]$/.test(current) && DANGLING_END_RE.test(current)) {
        j += 1;
        continue;
      }
      break;
    }
    const regionStart = (lines[i] as (typeof lines)[number]).start;
    const regionEnd = (lines[j] as (typeof lines)[number]).end;
    const region = text.slice(regionStart, regionEnd);
    let sentenceStart = regionStart;
    const boundary = /([.!?])\s+(?=[A-Z0-9"“'(*•-])/g;
    for (const match of region.matchAll(boundary)) {
      const dot = regionStart + match.index;
      if (match[1] === ".") {
        const before = /([A-Za-z.]+)$/.exec(text.slice(sentenceStart, dot))?.[1] ?? "";
        const word = before.toLowerCase().replace(/^\.+/, "");
        if (
          ABBREVIATIONS.has(word) ||
          /^[A-Z]$/.test(before) ||
          /^(?:[a-z]\.)+[a-z]$/i.test(word)
        ) {
          continue;
        }
      }
      push(sentenceStart, dot + 1);
      sentenceStart = dot + match[0].length;
    }
    push(sentenceStart, regionEnd);
    i = j + 1;
  }
  return sentences;
}

/**
 * Legal boilerplate, pay transparency, privacy and benefits text. Place names in it are never
 * eligibility statements ("the pay range for candidates in California", "regardless of citizenship",
 * "if you are a resident of the EU, read our GDPR notice").
 */
const BOILERPLATE_RE = new RegExp(
  [
    String.raw`equal (?:employment )?opportunit`,
    String.raw`without regard to`,
    String.raw`regardless of (?!(?:your |their |candidate |the candidate's )?(?:location|where you (?:live|are)|time ?zone|country))`,
    String.raw`discriminat`,
    String.raw`protected (?:veteran|characteristic|class|status|by (?:federal|state|applicable|law))`,
    String.raw`affirmative action`,
    String.raw`reasonable accommodation`,
    String.raw`\bE-Verify\b`,
    String.raw`privacy (?:notice|policy|statement)`,
    String.raw`\bGDPR\b`,
    String.raw`\bCCPA\b`,
    String.raw`personal (?:data|information)`,
    String.raw`fair chance`,
    String.raw`scam`,
    String.raw`impersonat`,
    String.raw`evaluate your application`,
    String.raw`as applicable`,
    String.raw`salary`,
    String.raw`\bpay (?:range|scale|band|zone|tier|transparency)`,
    String.raw`\bpay\b[^.]{0,40}\b(?:range|zone|tier)`,
    String.raw`compensation`,
    String.raw`\bOTE\b`,
    String.raw`on[- ]target earnings`,
    String.raw`base (?:salary|pay|range)`,
    String.raw`\b(?:USD|EUR|GBP|CAD)\b[^.]{0,20}\d`,
    String.raw`[$€£]\s?\d`,
    String.raw`\b401\(?k\)?`,
    String.raw`health (?:insurance|coverage|benefits)`,
    String.raw`benefits? (?:vary|differ|include|eligib|package|program)`,
    String.raw`paid time off`,
    String.raw`parental leave`,
  ].join("|"),
  "i",
);

export function isBoilerplate(sentence: string): boolean {
  return BOILERPLATE_RE.test(sentence);
}

/** Anti-discrimination core wording: place words in it ("national origin") are never rules. */
const EEO_CORE_RE =
  /equal (?:employment )?opportunit|without regard to|discriminat|protected (?:veteran|characteristic|class|status|by)|affirmative action|reasonable accommodation|fair chance/i;

/**
 * B4: boilerplate the extractor may skip. A sentence with a restriction cue and a place is never
 * skipped for pay, benefits, E-Verify or privacy words ("This is a US-only role with a base salary
 * of $150k", "Candidates must reside in the EU (GDPR requirement)"); with anti-discrimination
 * wording it is kept when a clause outside that wording has the cue and the place ("Must be located
 * in the US; we don't discriminate").
 */
export function isPureBoilerplate(sentence: string): boolean {
  if (!isBoilerplate(sentence)) return false;
  if (!hasRestrictionCueAndPlace(sentence)) return true;
  const clauses = sentence.split(/;|\(|\)|\s[-–—]\s|,\s*(?:so|and|but|which)\b/i);
  if (clauses.some((clause) => !isBoilerplate(clause) && hasRestrictionCueAndPlace(clause))) {
    return false;
  }
  return EEO_CORE_RE.test(sentence);
}

/**
 * Company self-description: offices, customers, teams spread across places, markets. Used to skip
 * worldwide, timezone and engagement cues that describe the company rather than the hire.
 */
const DESCRIPTIVE_RE = new RegExp(
  [
    String.raw`(?<!home )\boffices?\b`,
    String.raw`\bheadquarter`,
    String.raw`\bHQ\b`,
    String.raw`\bfounded\b`,
    String.raw`\bcustomers?\b`,
    String.raw`\bclients?\b`,
    String.raw`\busers?\b`,
    String.raw`\bmerchants?\b`,
    String.raw`\bplayers\b`,
    String.raw`\bbrands\b`,
    String.raw`\borganizations\b`,
    String.raw`\bcompanies\b`,
    String.raw`\bbusinesses\b`,
    String.raw`\bpartners?\b`,
    String.raw`\bmarkets?\b`,
    String.raw`\binvestors?\b`,
    String.raw`\bpresence\b`,
    String.raw`\bexpand`,
    String.raw`\bcommunity\b`,
    String.raw`\b(?:team|teams|colleagues|employees|engineers|people|members)\b[^.]{0,30}\b(?:distributed|spread|located|based|across|around|throughout|in over|in more than)\b`,
    String.raw`\bwe (?:are|'re) (?:a|an)\b[^.]{0,40}\bcompany\b`,
    String.raw`\b(?:team|teams)\b[^.]{0,40}\b(?:collaborat|operat|covers?|spans?)`,
    String.raw`\bcoworking|\bco-working`,
  ].join("|"),
  "i",
);

export function isDescriptive(sentence: string): boolean {
  return DESCRIPTIVE_RE.test(sentence);
}

/** Negation cue in a clause ("not", "unable", "n't"). */
export const NEGATION_RE = /\b(?:not|no|never|cannot|unable|without|neither|nor)\b|n['’]t\b/i;

/** Conditional or scoping lead-ins that make a place statement not a rule ("if you are based in"). */
export const CONDITIONAL_RE =
  /\b(?:if|when|whether|unless|once|for (?:those|candidates|applicants|roles|employees|people|residents|hires|team members|individuals)|applies to|depending on|in case)\b/i;

/**
 * B4: lead-ins that look conditional but do not condition the rule: "If hired, you must reside in
 * the US", "Once hired", "When you join", "When working with us", "Whether you're in NYC or
 * Austin, you must be based in the US".
 */
const NOT_A_CONDITION_RE =
  /\b(?:if|once|when|after)\s+(?:you(?:'re|’re| are)\s+)?(?:hired|selected|successful|onboarded|offered the (?:role|position|job))\b[^,;]*,?|\b(?:when|once|after)\s+you\s+(?:join|start|begin)\w*\b[^,;]*,?|\bwhen\s+working\s+(?:with|for|at)\s+(?:us|[A-Z][\w&.-]*)\b,?|\bwhether\s+you(?:'re|’re| are)\s+(?:in|based in|located in|living in|from)\s+[^,;]+,/gi;

/** True when `clause` conditions the statement after it (see `NOT_A_CONDITION_RE`). */
export function isConditional(clause: string): boolean {
  return CONDITIONAL_RE.test(clause.replace(NOT_A_CONDITION_RE, " "));
}

/** Preference wording that weakens a rule. */
export const PREFERENCE_RE =
  /\b(?:prefer|preferred|preferably|preference|ideally|nice to have|bonus|a plus|plus point|desired|desirable|advantage|advantageous|we'd love|would love|highly regarded|regarded|valued|beneficial|helpful|prioriti[sz]\w*)\b/i;

/**
 * B4: the part of the clause before `index` that a negation can govern. A negation stops at ";",
 * a dash, "but", "so", "however", ", and", and "and" before a new subject ("We don't offer
 * relocation and you must be based in the US" keeps the US rule).
 */
export function negationScopeBefore(sentence: string, index: number): string {
  const head = clauseBefore(sentence, index);
  const cuts = [
    ...head.matchAll(
      /;|—|–|\s-\s|\bbut\b|\bso\b|\bhowever\b|\bthough\b|,\s*and\b|\band\s+(?=(?:you|we|candidates|applicants|all|they|the (?:candidate|successful|role|position))\b)/gi,
    ),
  ];
  const last = cuts[cuts.length - 1];
  return last ? head.slice(last.index + last[0].length) : head;
}

/** The clause of `sentence` that ends at `index`: from the last ; : ( or sentence start. */
export function clauseBefore(sentence: string, index: number): string {
  const head = sentence.slice(0, index);
  const cut = Math.max(head.lastIndexOf(";"), head.lastIndexOf(":"), head.lastIndexOf(" - "));
  return cut >= 0 ? head.slice(cut + 1) : head;
}
