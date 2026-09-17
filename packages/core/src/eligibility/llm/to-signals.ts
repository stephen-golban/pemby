// Maps the `job-enrichment` output to eligibility signals (source "llm"). The model only reports
// what the post says; this file decides how much of it to trust:
//
// - Places resolve through the regions API (ISO codes, region codes, country and region names and
//   aliases, case-insensitive). Unknown places are dropped and counted.
// - Homonyms (review m2): "GE"/"Georgia", "Odessa", "Belgrade" and "Armenia" name a target country
//   only with a strong cue in the quote or the post (see HOMONYMS). Otherwise the country goes to
//   `guessedCountries` and a place statement left with no resolved place is weak.
// - Every quote must appear in the post text, inside a field the model saw as post content (title,
//   locations, employment type, description), after whitespace, quote-character and case
//   normalization only. A quote that does not makes the signal `weak`.
// - Quote quality (review M3, `judgeQuote`): at least 4 words, the trigger wording of its kind, a
//   name for one of its places (worldwide: a worldwide word), and a sentence that is not a perk,
//   preference, condition, company description or boilerplate. Failing any of these makes the
//   signal weak. Length and trigger apply to positive kinds only; a verified restriction (exclude,
//   work authorization, citizenship, required timezone, "<place> only") naming one of its places
//   stays at least implied. A negated statement is flipped (allow-list to exclude, sponsorship to no
//   sponsorship, at most implied) or dropped.
// - A quote from the Locations line is at most implied. Timezone numbers are clamped.
//
// The engine never lets a weak signal create green or red (`ENGINE_WEAK_POLICY`), so a bad quote
// can only lower confidence. Isomorphic.

import type { WayOfWorking } from "../../ways-of-working";
import { ALPHA3_TO_ALPHA2, COUNTRIES, isCountryCode, type CountryCode } from "../regions/countries";
import { REGION_INFOS, isRegionCode, type RegionCode } from "../regions/groups";
import {
  findPlaceMentions,
  isCanadianProvinceAbbreviation,
  isUsStateAbbreviation,
  lookupPlace,
} from "../regions/match";
import {
  CITIZENSHIP_REQUIREMENTS,
  ENGAGEMENT_MODES,
  type CitizenshipRequirement,
  type EligibilitySignal,
  type EngagementMode,
  type EvidenceField,
  type SignalEvidence,
  type SignalScopes,
  type SignalStrength,
  type TimezoneConstraint,
} from "../signals";
import { buildEnrichmentInput, type EnrichmentPost } from "./input";
import { isPreferredOverlap, isRestriction, judgeQuote, sentenceAround } from "./quality";
import { locateQuote, trimQuote } from "./quote";
import type { JobEnrichmentOutput, LlmEligibilityItem } from "./schema";

/**
 * The contract this mapping relies on in `decideEligibility` (engine/index.ts): weak signals are
 * never positives or hard negatives, and LLM-only greens are capped. So an unverified or low-quality
 * quote can neither create green nor red. If the engine changes this, these quotes need another
 * guard.
 */
export const ENGINE_WEAK_POLICY = "weak-never-green" as const;

/** `EligibilitySignal` with the rules owner's `guessedCountries` (countries a homonym may mean). */
type LlmSignal = EligibilitySignal & { guessedCountries?: readonly CountryCode[] };

export interface LlmSignalsResult {
  signals: EligibilitySignal[];
  /** Places plus whole items that were dropped. */
  dropped: number;
  droppedPlaces: number;
  /** Items dropped: no usable place, unknown engagement mode, or negated with no safe opposite. */
  droppedItems: number;
  /** Quotes that did not appear in the post content (their signals were downgraded to weak). */
  unverifiedQuotes: number;
  /** Place statements whose quote names none of their places (downgraded to weak). */
  unsupportedPlaces: number;
  /** Quotes that failed a quality check (downgraded to weak), by reason. */
  weakQuotes: Record<string, number>;
  /** Negated statements turned into their opposite. */
  flipped: number;
  /** D11: true only when the model says so and its money quote appears in the post. */
  asksCandidateForMoney: boolean;
}

type ResolvedPlace =
  | { country: CountryCode }
  | { region: RegionCode }
  /** A homonym without a strong cue: the country it may mean. */
  | { guessed: CountryCode };

/**
 * Names shared by a target country and another place. `strong` cues settle the target country;
 * `against` cues (the other place) keep it a guess even with a strong cue elsewhere in the post.
 * Georgia mirrors the rules owner's cues in regions/match.ts (Tbilisi, Batumi, Sakartvelo).
 */
const HOMONYMS: ReadonlyArray<{
  country: CountryCode;
  name: RegExp;
  strong: RegExp;
  against: RegExp;
}> = [
  {
    country: "GE",
    name: /^(?:GE|GEO|Georgia|Sakartvelo)$/i,
    strong:
      /\b(?:Tbilisi|Batumi|Kutaisi|Rustavi|Sakartvelo|Republic of Georgia|country of Georgia|Georgia \(country\)|Georgian (?:citizens?|residents?|lari|entity))\b|\bGEL\b/,
    against:
      /\bGeorgia\s*(?:,\s*)?(?:\(?\s*(?:GA|USA|US|U\.S\.)\b|United States)|\b(?:Atlanta|Savannah|Augusta|Athens, GA|Alpharetta|Macon)\b|,\s*GA\b/,
  },
  {
    country: "UA",
    name: /^(?:Odessa|Odesa)$/i,
    strong: /\bUkrain\w*/i,
    against: /\bOdessa,?\s*(?:TX|Texas)\b/i,
  },
  {
    country: "RS",
    name: /^(?:Belgrade)$/i,
    strong: /\bSerbia\w*/i,
    against: /\bBelgrade,?\s*(?:MT|Montana|ME|Maine)\b/i,
  },
  {
    country: "AM",
    name: /^(?:AM|ARM|Armenia)$/i,
    // The country name itself is the cue; only the Colombian city keeps it a guess.
    strong: /\bArmenia\b|\bYerevan\b/,
    against: /\bArmenia,?\s*(?:Quind\w*|Colombia)\b/i,
  },
];

const LOWER_NAMES: ReadonlyMap<string, { country: CountryCode } | { region: RegionCode }> = (() => {
  const map = new Map<string, { country: CountryCode } | { region: RegionCode }>();
  for (const info of REGION_INFOS) {
    for (const name of [info.name, ...info.aliases]) {
      const key = name.toLowerCase();
      if (!map.has(key)) map.set(key, { region: info.code });
    }
  }
  for (const info of COUNTRIES.values()) {
    for (const name of [info.name, ...info.aliases]) {
      const key = name.toLowerCase();
      if (key === "georgia") continue;
      if (!map.has(key)) map.set(key, { country: info.code });
    }
  }
  return map;
})();

/**
 * One place string from the model. `contexts` are the quote first, then the post text; homonym
 * cues are searched in them. Null when it is not exactly one known place.
 */
export function resolveLlmPlace(
  name: string,
  contexts: readonly string[] = [],
): ResolvedPlace | null {
  const trimmed = name.trim().replace(/\.$/, "");
  if (trimmed === "") return null;

  const homonym = HOMONYMS.find((h) => h.name.test(trimmed));
  if (homonym) {
    const against = contexts.some((c) => homonym.against.test(c));
    const strong = contexts.some((c) => homonym.strong.test(c));
    return !against && strong ? { country: homonym.country } : { guessed: homonym.country };
  }

  const demonym = DEMONYMS.get(trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase());
  if (demonym) {
    return HOMONYMS.some((h) => h.country === demonym)
      ? resolveLlmPlace(demonym, contexts)
      : { country: demonym };
  }
  const upper = trimmed.toUpperCase();
  if (/^[A-Z]{2}$/.test(trimmed) && isCountryCode(trimmed)) return { country: trimmed };
  if (/^[A-Z]{3}$/.test(trimmed)) {
    const alpha2 = ALPHA3_TO_ALPHA2.get(trimmed);
    if (alpha2) return { country: alpha2 };
  }
  const regionKey = upper.replace(/[\s-]+/g, "_");
  if (isRegionCode(regionKey)) return { region: regionKey };

  const ref = lookupPlace(trimmed);
  if (ref?.type === "country") return { country: ref.country };
  if (ref?.type === "region") return { region: ref.region };
  if (ref?.type === "ambiguous") return null;
  return LOWER_NAMES.get(trimmed.toLowerCase()) ?? null;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

interface QuoteContext {
  text: string;
  sections: { field: EvidenceField; start: number; end: number; sourceStart: number }[];
}

interface Located {
  /**
   * `start`/`end` are in the field's own text, the coordinate space the rules extractor uses:
   * offsets into `descriptionText` for "description", into `title` for "title", and into
   * `locations.join("; ")` for "locations". With a plain string post, offsets into that string.
   * `text` is the post's own span, including list lines a "one of:" quote introduces.
   */
  evidence: SignalEvidence;
  verified: boolean;
  /** Offsets in the model input text, when verified. */
  start: number;
  end: number;
}

const LIST_LINE_RE = /^\s*(?:[•·▪◦*\-–—]|\d{1,2}[.)])\s*\S/;

/**
 * A quote that ends a line with ":" ("Must be based in one of:") introduces the lines below it.
 * Returns the input offset where those list lines end (at most 40 lines), or `end` itself.
 */
function listEnd(text: string, end: number, limit: number): number {
  const lineEnd = text.indexOf("\n", end);
  const restOfLine = text.slice(end, lineEnd < 0 ? limit : Math.min(lineEnd, limit));
  const quoteLine = text.slice(text.lastIndexOf("\n", end - 1) + 1, end);
  if (!/:\s*$/.test(quoteLine + restOfLine) || lineEnd < 0 || lineEnd >= limit) return end;
  let cursor = lineEnd;
  let last = end;
  for (let n = 0; n < 40 && cursor < limit; n++) {
    const next = text.indexOf("\n", cursor + 1);
    const stop = next < 0 || next > limit ? limit : next;
    const line = text.slice(cursor + 1, stop);
    const shortItem =
      line.trim().length > 0 && line.trim().length <= 60 && !/[.!?]$/.test(line.trim());
    if (!LIST_LINE_RE.test(line) && !shortItem) break;
    last = stop;
    cursor = stop;
    if (stop === limit) break;
  }
  return last;
}

function locate(context: QuoteContext, quote: string): Located {
  const match = locateQuote(context.text, quote);
  const unverified: Located = {
    evidence: { field: "description", text: trimQuote(quote).slice(0, 500) },
    verified: false,
    start: -1,
    end: -1,
  };
  if (!match) return unverified;
  if (context.sections.length === 0) {
    const end = listEnd(context.text, match.end, context.text.length);
    return {
      evidence: {
        field: "description",
        text: context.text.slice(match.start, end),
        start: match.start,
        end,
      },
      verified: true,
      start: match.start,
      end,
    };
  }
  // Overlap, not containment: a quote may start with the input's own label ("Locations: ...").
  // A quote from no section (the Company or Workplace type line, labels only) is not post content.
  const section = context.sections.find((s) => match.start < s.end && match.end > s.start);
  if (!section) return unverified;
  const from = Math.max(match.start, section.start);
  const to = listEnd(context.text, Math.min(match.end, section.end), section.end);
  return {
    evidence: {
      field: section.field,
      text: context.text.slice(from, to),
      start: from - section.start + section.sourceStart,
      end: to - section.start + section.sourceStart,
    },
    verified: true,
    start: from,
    end: to,
  };
}

function scopesFrom(
  places: readonly string[],
  contexts: readonly string[],
): { scopes: SignalScopes; guessed: CountryCode[]; dropped: number } {
  const countries = new Set<CountryCode>();
  const regions = new Set<RegionCode>();
  const guessed = new Set<CountryCode>();
  let dropped = 0;
  for (const place of places) {
    const resolved = resolveLlmPlace(place, contexts);
    if (!resolved) dropped += 1;
    else if ("country" in resolved) countries.add(resolved.country);
    else if ("region" in resolved) regions.add(resolved.region);
    else guessed.add(resolved.guessed);
  }
  for (const country of countries) guessed.delete(country);
  return {
    scopes: { countries: [...countries], regions: [...regions] },
    guessed: [...guessed],
    dropped,
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Demonyms and adjectives ("Ukrainian residents", "Canadian residents only"). Mirrors DEMONYMS in
 * rules/extract.ts until the rules owner exports a regions table; keep the two in step.
 */
const DEMONYMS: ReadonlyMap<string, CountryCode> = new Map([
  ["American", "US"],
  ["British", "GB"],
  ["Canadian", "CA"],
  ["Australian", "AU"],
  ["Israeli", "IL"],
  ["Indian", "IN"],
  ["German", "DE"],
  ["French", "FR"],
  ["Swiss", "CH"],
  ["Singaporean", "SG"],
  ["Japanese", "JP"],
  ["Korean", "KR"],
  ["Polish", "PL"],
  ["Ukrainian", "UA"],
  ["Moldovan", "MD"],
  ["Georgian", "GE"],
  ["Armenian", "AM"],
  ["Serbian", "RS"],
  ["Philippine", "PH"],
  ["Filipino", "PH"],
  ["Brazilian", "BR"],
  ["Mexican", "MX"],
  ["Spanish", "ES"],
  ["Portuguese", "PT"],
  ["Dutch", "NL"],
  ["Irish", "IE"],
  ["Romanian", "RO"],
  ["Argentine", "AR"],
  ["Argentinian", "AR"],
  ["Colombian", "CO"],
  ["Chilean", "CL"],
  ["Estonian", "EE"],
  ["Lithuanian", "LT"],
  ["Latvian", "LV"],
  ["Czech", "CZ"],
  ["Hungarian", "HU"],
  ["Bulgarian", "BG"],
  ["Croatian", "HR"],
  ["Turkish", "TR"],
  ["Emirati", "AE"],
  ["Nigerian", "NG"],
  ["Kenyan", "KE"],
  ["Egyptian", "EG"],
  ["Pakistani", "PK"],
  ["Vietnamese", "VN"],
  ["Indonesian", "ID"],
  ["Malaysian", "MY"],
  ["Thai", "TH"],
  ["Chinese", "CN"],
  ["Italian", "IT"],
  ["Swedish", "SE"],
  ["Norwegian", "NO"],
  ["Danish", "DK"],
  ["Finnish", "FI"],
  ["Austrian", "AT"],
  ["Belgian", "BE"],
  ["Greek", "GR"],
  // Beyond the rules list: target and nearby countries.
  ["Albanian", "AL"],
  ["Bosnian", "BA"],
  ["Montenegrin", "ME"],
  ["Macedonian", "MK"],
  ["Kosovar", "XK"],
]);

/** Countries a quote names by demonym, US state code or Canadian province code. */
function countriesNamedByCodes(quote: string): Set<CountryCode> {
  const out = new Set<CountryCode>();
  for (const [, word] of quote.matchAll(/\b([A-Z][a-z]+)\b/g)) {
    const country = DEMONYMS.get(word!);
    if (country) out.add(country);
  }
  // Two or more state codes in a list ("AZ, CA, CO, TX") name the US; one alone is too ambiguous.
  const codes = [...quote.matchAll(/\b([A-Z]{2})\b/g)].map((m) => m[1]!);
  if (codes.filter((c) => isUsStateAbbreviation(c)).length >= 2) out.add("US");
  if (codes.filter((c) => isCanadianProvinceAbbreviation(c)).length >= 2) out.add("CA");
  return out;
}

/** True when the quote names at least one of the places, resolved or as the model wrote it. */
function quoteNamesPlace(quote: string, places: readonly string[], scopes: SignalScopes): boolean {
  for (const country of countriesNamedByCodes(quote)) {
    if (scopes.countries.includes(country)) return true;
  }
  for (const mention of findPlaceMentions(quote)) {
    const ref = mention.ref;
    if (ref.type === "country" && scopes.countries.includes(ref.country)) return true;
    if (ref.type === "region" && scopes.regions.includes(ref.region)) return true;
    // "Georgia" in the quote names GE once the place was settled (or guessed) as GE.
    if (ref.type === "ambiguous" && ref.candidates.some((c) => scopes.countries.includes(c))) {
      return true;
    }
  }
  return places.some((place) => {
    const trimmed = place.trim();
    if (trimmed.length < 2) return false;
    return new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(trimmed)}(?![\\p{L}\\p{N}])`, "iu").test(
      quote,
    );
  });
}

function waysOf(item: LlmEligibilityItem): readonly WayOfWorking[] {
  return item.waysOfWorking === "all" ? [] : [...new Set(item.waysOfWorking)];
}

const isEngagementMode = (value: string | null): value is EngagementMode =>
  value !== null && (ENGAGEMENT_MODES as readonly string[]).includes(value);
const isRequirement = (value: string | null): value is CitizenshipRequirement =>
  value !== null && (CITIZENSHIP_REQUIREMENTS as readonly string[]).includes(value);

function timezoneFrom(
  output: JobEnrichmentOutput["timezone"],
): Omit<TimezoneConstraint, "places"> | null {
  if (!output) return null;
  const { minUtcOffset, maxUtcOffset, overlapHours } = output;
  const ranges =
    minUtcOffset !== null && maxUtcOffset !== null
      ? [
          {
            minOffset: clamp(Math.min(minUtcOffset, maxUtcOffset), -12, 14),
            maxOffset: clamp(Math.max(minUtcOffset, maxUtcOffset), -12, 14),
          },
        ]
      : [];
  const hours = overlapHours === null ? null : clamp(overlapHours, 0, 24);
  return {
    mode: hours === null ? "within" : "overlap",
    ranges,
    overlapHours: hours === null ? null : hours >= 8 ? "full" : hours,
  };
}

const capAt = (strength: SignalStrength, cap: "implied"): SignalStrength =>
  strength === "explicit" ? cap : strength;

/**
 * Signals from one enrichment output. `post` is the text the model saw: the `EnrichmentPost` (so
 * evidence gets its field and offsets) or the exact input string.
 */
export function llmToSignals(
  output: JobEnrichmentOutput,
  post: EnrichmentPost | string,
): LlmSignalsResult {
  const context: QuoteContext =
    typeof post === "string"
      ? { text: post, sections: [] }
      : (({ text, sections }) => ({ text, sections }))(buildEnrichmentInput(post));

  const signals: EligibilitySignal[] = [];
  let droppedPlaces = 0;
  let droppedItems = 0;
  let unverifiedQuotes = 0;
  let unsupportedPlaces = 0;
  let flipped = 0;
  const weakQuotes: Record<string, number> = {};
  const noteWeak = (reason: string) => {
    weakQuotes[reason] = (weakQuotes[reason] ?? 0) + 1;
  };

  let timezoneEmitted = false;
  const timezone = timezoneFrom(output.timezone);
  if (output.timezone && timezone) {
    const located = locate(context, output.timezone.quote);
    if (!located.verified) unverifiedQuotes += 1;
    signals.push({
      source: "llm",
      kind: "timezone",
      scopes: { countries: [], regions: [] },
      waysOfWorking: [],
      strength:
        located.verified &&
        output.timezone.required &&
        !isPreferredOverlap(sentenceAround(context.text, located.start, located.end).text)
          ? "explicit"
          : "weak",
      evidence: located.evidence,
      timezone,
    });
    timezoneEmitted = true;
  }

  for (const item of output.eligibility) {
    if (item.kind === "timezone" && timezoneEmitted) continue;
    const mode = item.kind === "engagement" ? item.detail : null;
    if (item.kind === "engagement" && !isEngagementMode(mode)) {
      droppedItems += 1;
      continue;
    }
    const engagementMode = isEngagementMode(mode) ? mode : null;

    const { scopes, guessed, dropped } = scopesFrom(item.places, [item.quote, context.text]);
    droppedPlaces += dropped;
    const hasPlace = scopes.countries.length > 0 || scopes.regions.length > 0;
    const listKind = item.kind === "allow-list" || item.kind === "exclude";
    if (listKind && !hasPlace && guessed.length === 0) {
      droppedItems += 1;
      continue;
    }

    // Strength: the model's, then every downgrade.
    let kind = item.kind;
    let strength: SignalStrength = item.strength;
    const located = locate(context, item.quote);
    if (!located.verified) {
      unverifiedQuotes += 1;
      strength = "weak";
    } else {
      const restriction = isRestriction(item.kind, engagementMode, located.evidence.text);
      const sentence = sentenceAround(context.text, located.start, located.end);
      const postedLocation =
        item.kind === "allow-list" &&
        !restriction &&
        (located.evidence.field === "locations" || located.evidence.field === "title");
      const verdict = judgeQuote(
        item.kind,
        engagementMode,
        located.evidence.text,
        sentence,
        restriction,
        postedLocation,
      );
      // Posted locations and titles are where a role is listed, not a stated rule: implied at most.
      if (postedLocation) strength = capAt(strength, "implied");

      if (verdict.action === "drop") {
        droppedItems += 1;
        continue;
      }
      if (verdict.action === "flip") {
        flipped += 1;
        strength = capAt(strength, "implied");
        if (kind === "allow-list") kind = "exclude";
      }
      // A verified restriction that names one of its resolved places stays at least implied:
      // trusting a restriction more can only lower a tier.
      const placedRestriction =
        restriction && hasPlace && quoteNamesPlace(located.evidence.text, item.places, scopes);
      if (placedRestriction && verdict.action === "keep") {
        if (strength === "weak") strength = "implied";
      } else if (verdict.weakReasons.length > 0) {
        for (const reason of verdict.weakReasons) noteWeak(reason);
        strength = "weak";
      }
      // An overlap band with no hours or requirement word is preferred, not required.
      if (item.kind === "timezone" && isPreferredOverlap(sentence.text)) {
        noteWeak("preferred-overlap");
        strength = "weak";
      }
      const flippedMode =
        verdict.action === "flip" && engagementMode === "visa-sponsorship"
          ? "no-visa-sponsorship"
          : engagementMode;
      if (flippedMode !== engagementMode) {
        signals.push(
          build(item, kind, strength, located.evidence, scopes, guessed, "no-visa-sponsorship"),
        );
        continue;
      }
    }
    if (located.evidence.field === "locations") strength = capAt(strength, "implied");

    const placeBased =
      (hasPlace || guessed.length > 0) &&
      (kind === "allow-list" ||
        kind === "exclude" ||
        kind === "work-authorization" ||
        kind === "citizenship-or-clearance");
    const namedIn = located.verified ? located.evidence.text : item.quote;
    if (placeBased && strength !== "weak" && !quoteNamesPlace(namedIn, item.places, scopes)) {
      unsupportedPlaces += 1;
      strength = "weak";
    }
    // A list whose places are only guesses cannot say who is in or out.
    if (listKind && !hasPlace) strength = "weak";

    signals.push(build(item, kind, strength, located.evidence, scopes, guessed, engagementMode));
    if (kind === "timezone") timezoneEmitted = true;
  }

  const moneyQuote = output.moneyQuote?.trim() ?? "";
  const asksCandidateForMoney =
    output.asksCandidateForMoney && moneyQuote !== "" && locate(context, moneyQuote).verified;

  return {
    signals,
    dropped: droppedPlaces + droppedItems,
    droppedPlaces,
    droppedItems,
    unverifiedQuotes,
    unsupportedPlaces,
    weakQuotes,
    flipped,
    asksCandidateForMoney,
  };
}

function build(
  item: LlmEligibilityItem,
  kind: LlmEligibilityItem["kind"],
  strength: SignalStrength,
  evidence: SignalEvidence,
  scopes: SignalScopes,
  guessed: readonly CountryCode[],
  mode: EngagementMode | null,
): EligibilitySignal {
  const hasPlace = scopes.countries.length > 0 || scopes.regions.length > 0;
  const base: LlmSignal = {
    source: "llm",
    kind,
    scopes: kind === "worldwide" || kind === "timezone" ? { countries: [], regions: [] } : scopes,
    waysOfWorking: waysOf(item),
    strength,
    evidence,
    ...(guessed.length > 0 ? { guessedCountries: guessed } : {}),
  };
  switch (kind) {
    case "citizenship-or-clearance":
      base.requirement = isRequirement(item.detail) ? item.detail : "citizenship";
      break;
    case "engagement":
      if (mode) base.engagement = { mode };
      break;
    case "timezone":
      base.timezone = {
        mode: "within",
        ranges: [],
        overlapHours: null,
        ...(hasPlace ? { places: scopes } : {}),
      };
      break;
    default:
      break;
  }
  return base;
}
