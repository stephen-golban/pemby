// Finds country, region, subdivision and city names in free text and resolves them to ISO codes or
// region codes. Isomorphic.

import { COUNTRIES, GEORGIA_NAME, type CountryCode } from "./countries";
import { REGION_INFOS, type RegionCode } from "./groups";
import { CA_PROVINCES, CITIES, NON_PLACE_PHRASES, OTHER_SUBDIVISIONS, US_STATES } from "./places";

export type PlaceRef =
  | {
      type: "country";
      country: CountryCode;
      /** How the name was given: a country name, a subdivision or a city inside it. */
      via: "country" | "subdivision" | "city";
      /** Resolved from context or a homonym, not from an unambiguous name (see `guessedCountries`). */
      guessed?: boolean;
    }
  | { type: "region"; region: RegionCode }
  /** A name that can mean several places ("Georgia", "America", "Congo"). */
  | { type: "ambiguous"; name: string; candidates: readonly CountryCode[] };

export interface PlaceMention {
  start: number;
  end: number;
  /** Verbatim text. */
  text: string;
  ref: PlaceRef;
}

type Entry = PlaceRef | null;

const AMBIGUOUS_NAMES: ReadonlyArray<readonly [string, readonly CountryCode[]]> = [
  [GEORGIA_NAME, ["GE", "US"]],
  ["America", ["US"]],
  ["Congo", ["CD", "CG"]],
];

/**
 * Names that are also places in other countries: "Odessa, TX", "Belgrade, MT", "Armenia, Quindío,
 * Colombia", "Georgia" (US state). Bare, they resolve to the Pemby country but only as a guess.
 * The value lists the other countries a following country name may resolve them to.
 */
const HOMONYMS: ReadonlyMap<string, readonly CountryCode[]> = new Map([
  ["Georgia", ["US"]],
  ["Armenia", ["CO"]],
  ["Odessa", ["US"]],
  ["Odesa", ["US"]],
  ["Belgrade", ["US"]],
  ["Moscow", ["US"]],
  ["Paris", ["US"]],
  ["Athens", ["US"]],
  ["Dublin", ["US"]],
  ["London", ["CA", "US"]],
  ["Warsaw", ["US"]],
  ["Berlin", ["US"]],
  ["Lima", ["US"]],
  ["Toledo", ["US"]],
  ["Florence", ["US"]],
  ["Hamburg", ["US"]],
  ["Sofia", ["US"]],
]);

/** Short all-caps words that stay place codes even next to other capitals ("REMOTE US"). */
const CAPS_NEIGHBOURS_OK = new Set([
  "REMOTE",
  "ONLY",
  "BASED",
  "HYBRID",
  "ONSITE",
  "FULLY",
  "OR",
  "AND",
  "IN",
  "FROM",
  "THE",
]);

function buildDictionary(): Map<string, Entry> {
  const dict = new Map<string, Entry>();
  const add = (name: string, entry: Entry) => {
    for (const form of new Set([name, name.toUpperCase()])) {
      if (!dict.has(form)) dict.set(form, entry);
    }
  };
  for (const phrase of NON_PLACE_PHRASES) add(phrase, null);
  for (const [name, candidates] of AMBIGUOUS_NAMES) {
    add(name, { type: "ambiguous", name, candidates });
  }
  for (const info of COUNTRIES.values()) {
    const entry: PlaceRef = { type: "country", country: info.code, via: "country" };
    for (const name of [info.name, ...info.aliases]) {
      if (name === GEORGIA_NAME) continue;
      add(name, entry);
    }
  }
  for (const info of REGION_INFOS) {
    const entry: PlaceRef = { type: "region", region: info.code };
    for (const alias of info.aliases) add(alias, entry);
  }
  for (const [, name] of US_STATES) {
    add(name, { type: "country", country: "US", via: "subdivision" });
  }
  for (const [, name] of CA_PROVINCES) {
    add(name, { type: "country", country: "CA", via: "subdivision" });
  }
  for (const [name, country] of OTHER_SUBDIVISIONS) {
    add(name, { type: "country", country, via: "subdivision" });
  }
  for (const [name, country] of CITIES) add(name, { type: "country", country, via: "city" });
  return dict;
}

const DICTIONARY = buildDictionary();

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const MENTION_RE = new RegExp(
  `(?<![\\p{L}\\p{N}_])(?:${[...DICTIONARY.keys()]
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp)
    .join("|")})(?![\\p{L}\\p{N}_$])`,
  "gu",
);

const US_STATE_ABBR = new Set(US_STATES.map(([abbr]) => abbr));

/** Country and union codes that are places even inside shouted text ("REMOTE - US ONLY, NO C2C"). */
const NEVER_SHOUTED = new Set(["US", "USA", "U.S.", "U.S.A.", "UK", "U.K.", "EU", "UAE", "U.A.E."]);

/** A short all-caps code sitting inside shouted text ("JOIN US", "ABOUT US") is not a place. */
function isShoutedWord(text: string, start: number, end: number): boolean {
  const word = text.slice(start, end);
  // B4: "US", "UK", "EU" are dropped only in "JOIN US"/"ABOUT US"-style phrases, never as codes.
  if (NEVER_SHOUTED.has(word)) {
    if (word !== "US") return false;
    return /\b(?:JOIN|ABOUT|CONTACT|EMAIL|FOLLOW|WITH|FOR|TO|HELP|LET|TELL|GIVE|SEND|CALL|WHY|VISIT|FIND|MEET|READ|OF|BY)\s*$/.test(
      text.slice(Math.max(0, start - 12), start),
    );
  }
  if (word.length > 5 || word !== word.toUpperCase() || !/^[A-Z.&]+$/.test(word)) return false;
  const before = /([A-Za-z]+)[^A-Za-z]*$/.exec(text.slice(Math.max(0, start - 24), start))?.[1];
  const after = /^[^A-Za-z]*([A-Za-z]+)/.exec(text.slice(end, end + 24))?.[1];
  const shouted = (neighbour: string | undefined) =>
    neighbour !== undefined &&
    neighbour.length >= 2 &&
    neighbour === neighbour.toUpperCase() &&
    !CAPS_NEIGHBOURS_OK.has(neighbour) &&
    !DICTIONARY.has(neighbour);
  return shouted(before) || shouted(after);
}

/**
 * Every place name in `text`, longest match first, left to right. Phrases that only contain a
 * place name ("New Mexico" for Mexico, "Bank of America") never yield the inner place.
 * "Georgia" becomes GE or US when nearby names settle it; otherwise it stays ambiguous.
 */
export function findPlaceMentions(text: string): PlaceMention[] {
  const mentions: PlaceMention[] = [];
  for (const match of text.matchAll(MENTION_RE)) {
    const start = match.index;
    const end = start + match[0].length;
    const entry = DICTIONARY.get(match[0]);
    if (!entry) continue;
    if (isShoutedWord(text, start, end)) continue;
    // "non-EU candidates", "non-US based": the negation of a place is not that place.
    if (/\bnon[-\s]?$/i.test(text.slice(Math.max(0, start - 4), start))) continue;
    mentions.push({ start, end, text: match[0], ref: entry });
  }
  const resolved = mentions.map(
    (mention, index) => resolveAmbiguous(text, mentions, index) ?? mention,
  );
  return resolved.map((mention, index) => disambiguateLocality(text, resolved, index));
}

const withRef = (mention: PlaceMention, ref: PlaceRef): PlaceMention => ({ ...mention, ref });

/**
 * B3 M1: a city or homonym followed by a US state or Canadian province code (", TX") or by another
 * country name (", Colombia", ", Quindío, Colombia") resolves to that place; a bare homonym
 * ("Odessa", "Belgrade") stays in its Pemby country but is marked guessed.
 */
function disambiguateLocality(
  text: string,
  mentions: readonly PlaceMention[],
  index: number,
): PlaceMention {
  const mention = mentions[index] as PlaceMention;
  const ref = mention.ref;
  if (ref.type !== "country") return mention;
  const name = mention.text.charAt(0) + mention.text.slice(1).toLowerCase();
  // "Georgia" is settled (with its own guess flag) by `resolveAmbiguous`.
  if (name === GEORGIA_NAME) return mention;
  const homonymOf = HOMONYMS.get(name);
  const isCity = ref.via === "city";
  if (!isCity && !homonymOf) return mention;
  const after = text.slice(mention.end, mention.end + 60);
  const code = /^\s*,\s*([A-Z]{2})\b(?!\s*[-–]\s*[A-Z])/.exec(after)?.[1];
  if (code && code !== ref.country) {
    if (isUsStateAbbreviation(code) && (isCity || homonymOf?.includes("US"))) {
      return withRef(mention, { type: "country", country: "US", via: "city" });
    }
    if (isCanadianProvinceAbbreviation(code) && (isCity || homonymOf?.includes("CA"))) {
      return withRef(mention, { type: "country", country: "CA", via: "city" });
    }
  }
  const next = mentions[index + 1];
  const gap = next ? text.slice(mention.end, next.start) : "";
  if (
    next &&
    next.ref.type === "country" &&
    next.ref.via !== "city" &&
    /^\s*,\s*(?:[^,;\n]{1,30},\s*)?$/.test(gap)
  ) {
    const nextCountry = next.ref.country;
    if (nextCountry === ref.country) return withRef(mention, { ...ref, guessed: false });
    if (isCity || homonymOf?.includes(nextCountry)) {
      return withRef(mention, { type: "country", country: nextCountry, via: "city" });
    }
  }
  if (!homonymOf || ref.guessed) return mention;
  if (ref.via !== "country") return withRef(mention, { ...ref, guessed: true });
  // A homonym country name ("Armenia") is a guess only when no other country is named nearby.
  const otherCountry = mentions.some(
    (other) =>
      other !== mention &&
      other.ref.type === "country" &&
      other.ref.via === "country" &&
      Math.abs(other.start - mention.start) <= 200,
  );
  return otherCountry ? mention : withRef(mention, { ...ref, guessed: true });
}

/** Strong cues that "Georgia" is the country. */
const GEORGIA_COUNTRY_AFTER_RE =
  /^\s*(?:\(\s*(?:country|the country|Sakartvelo)\s*\)|,?\s*(?:Tbilisi|Batumi|Kutaisi|Sakartvelo)\b)/;
const GEORGIA_COUNTRY_BEFORE_RE =
  /\b(?:country of|nation of|Tbilisi,|Batumi,|Kutaisi,)\s*(?:the\s+)?$/i;
const CAUCASUS_NEIGHBOURS = new Set<string>(["AM", "AZ"]);

function resolveAmbiguous(
  text: string,
  mentions: readonly PlaceMention[],
  index: number,
): PlaceMention | null {
  const mention = mentions[index];
  if (!mention || mention.ref.type !== "ambiguous" || mention.ref.name !== GEORGIA_NAME)
    return null;
  const asCountry = (country: CountryCode, guessed = false): PlaceMention => ({
    ...mention,
    ref: {
      type: "country",
      country,
      via: country === "US" ? "subdivision" : "country",
      ...(guessed ? { guessed: true } : {}),
    },
  });
  // "Atlanta, Georgia", "Georgia, USA", "Georgia (GA)".
  const after = text.slice(mention.end, mention.end + 24);
  const before = text.slice(Math.max(0, mention.start - 24), mention.start);
  if (/^\s*[,(]?\s*(?:USA|US|U\.S\.|United States|GA\b)/.test(after)) return asCountry("US");
  const previous = mentions[index - 1];
  if (previous && mention.start - previous.end <= 3 && previous.ref.type === "country") {
    const country = previous.ref.country;
    if (previous.ref.via === "city" && (country === "US" || country === "GE")) {
      return asCountry(country);
    }
  }
  // B3 M2: GE only with strong cues (Tbilisi, Batumi, Kutaisi, Sakartvelo, "country of Georgia",
  // "Georgia (country)", or listed with Armenia, Azerbaijan or the Caucasus and no US places).
  if (GEORGIA_COUNTRY_AFTER_RE.test(after) || GEORGIA_COUNTRY_BEFORE_RE.test(before)) {
    return asCountry("GE");
  }
  let usNames = 0;
  let foreignCountries = 0;
  let caucasus = 0;
  for (const other of mentions) {
    if (other === mention || Math.abs(other.start - mention.start) > 300) continue;
    if (other.ref.type === "region" && other.ref.region === "CAUCASUS") caucasus += 1;
    if (other.ref.type !== "country") continue;
    if (other.ref.country === "US") usNames += 1;
    else if (other.ref.via === "country") {
      foreignCountries += 1;
      if (
        CAUCASUS_NEIGHBOURS.has(other.ref.country) &&
        Math.abs(other.start - mention.start) <= 80
      ) {
        caucasus += 1;
      }
    }
  }
  const window = text.slice(Math.max(0, mention.start - 300), mention.end + 300);
  if (/\bUS states?\b|\bstates?:|\bthe state\b/i.test(window)) usNames += 1;
  if (usNames > 0 && foreignCountries === 0) return asCountry("US");
  if (usNames === 0 && caucasus > 0) return asCountry("GE");
  // Other foreign countries nearby make the country likely, but it stays a guess.
  if (foreignCountries > 0 && usNames === 0) return asCountry("GE", true);
  return null;
}

/**
 * Resolves a whole string that should be one place ("Moldova, Republic of", "EMEA", "Kyiv"),
 * for structured fields such as schema.org names. Null when it is not exactly one known place.
 */
export function lookupPlace(name: string): PlaceRef | null {
  const trimmed = name.trim();
  const direct = DICTIONARY.get(trimmed);
  if (direct) return direct;
  const mentions = findPlaceMentions(trimmed);
  if (mentions.length === 1 && mentions[0]) {
    const rest = (trimmed.slice(0, mentions[0].start) + trimmed.slice(mentions[0].end)).trim();
    if (rest === "") return mentions[0].ref;
  }
  if (/^[A-Z]{2}$/.test(trimmed) && COUNTRIES.has(trimmed)) {
    return { type: "country", country: trimmed, via: "country" };
  }
  return null;
}

/** True for a two-letter US state abbreviation ("CA" in "San Mateo, CA"). */
export function isUsStateAbbreviation(value: string): boolean {
  return US_STATE_ABBR.has(value) || value === "GA";
}

const CA_PROVINCE_ABBR = new Set(CA_PROVINCES.map(([abbr]) => abbr));

/** True for a two-letter Canadian province abbreviation ("ON" in "Toronto, ON"). */
export function isCanadianProvinceAbbreviation(value: string): boolean {
  return CA_PROVINCE_ABBR.has(value);
}
