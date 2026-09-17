// Reads a list of places that starts at a given offset ("Poland, Romania, or Moldova only").
// Isomorphic.

import type { CountryCode } from "../regions/countries";
import type { RegionCode } from "../regions/groups";
import {
  isCanadianProvinceAbbreviation,
  isUsStateAbbreviation,
  type PlaceMention,
} from "../regions/match";

export interface PlaceList {
  countries: CountryCode[];
  regions: RegionCode[];
  /** Mentions consumed, in order. */
  mentions: PlaceMention[];
  /** Offset just past the last consumed token. */
  end: number;
  /** A name that could be several places ("Georgia" with no context), or an unknown capitalised word mid-list. */
  ambiguous: string[];
  /** The list is followed by "only". */
  only: boolean;
  /** The list is followed by "time zone(s)" / "hours": it names zones, not residence. */
  timezone: boolean;
  /** The list includes cities or subdivisions (an office anchor rather than a residence rule). */
  hasLocalities: boolean;
  /** Countries that only a guessed mention supplied (see `EligibilitySignal.guessedCountries`). */
  guessed: CountryCode[];
  /** The list followed "a country where we have an entity:", so it is the complete entity list. */
  entityIntro: boolean;
}

// Words and punctuation allowed between and before places.
const FILLER_WORDS = [
  "one of the following countries",
  "one of the following locations",
  "one of the following states",
  "one of the following regions",
  "one of the following provinces",
  "one of the following",
  "one of",
  "the following countries",
  "the following locations",
  "the following states",
  "the following regions",
  "the following provinces",
  "the following",
  "these countries",
  "these locations",
  "these regions",
  "these states",
  "this country",
  "any of these",
  "following countries",
  "following locations",
  "following states",
  "following regions",
  "U.S. states",
  "US states",
  "member states",
  "provinces of",
  "province of",
  "anywhere in",
  "anywhere within",
  "as well as",
  "and/or",
  "any of",
  "and",
  "or",
  "the",
  "an",
  "a",
  "either",
  "also",
  "including",
  "incl.",
  "incl",
  "plus",
  "states",
  "select",
  "specific",
  "approved",
  "countries",
  "country",
  "locations",
  "regions",
  "region",
  "areas",
  "area",
  "continental",
  "mainland",
  "within",
  "in",
  "from",
  "of",
];
const FILLER_RE = new RegExp(
  String.raw`^(?:[\s,;/&+()[\]*:|•·▪◦]+|-(?=\s)|[–—](?=\s)|(?:${FILLER_WORDS.map((w) => w.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")).join("|")})(?![\p{L}]))`,
  "iu",
);

// Words allowed right after a place.
const SUFFIX_RE =
  /^(?:\s*-?\s*based\b|\s+(?:countries|country|member states|region|area|zone)\b|\s+residents?\b|\s+nationals?\b)/i;

const ONLY_RE = /^\s*\)?\s*(?:[-–(]\s*)?only\b/i;

const ENTITY_INTRO_RE =
  /^(?:an?|one of the)\s+countr(?:y|ies)\s+(?:where|in which)\s+we\s+(?:have|operate|can hire)[^:.;]{0,40}:\s*/i;
const TIMEZONE_RE =
  /^\s*(?:-?\s*based\s+)?(?:time\s?zones?|timezones?|business hours|working hours|hours)\b/i;

/**
 * Parses places from `from` in `text` using precomputed `mentions` (from `findPlaceMentions` over
 * the same text). Stops at the first token that is neither a place nor filler, or at `limit`.
 */
export function parsePlaceList(
  text: string,
  mentions: readonly PlaceMention[],
  from: number,
  limit = text.length,
): PlaceList {
  const list: PlaceList = {
    countries: [],
    regions: [],
    mentions: [],
    end: from,
    ambiguous: [],
    only: false,
    timezone: false,
    hasLocalities: false,
    guessed: [],
    entityIntro: false,
  };
  let pos = from;
  let sawSeparator = true;
  let statesContext = false;
  const named = new Set<CountryCode>();
  for (let guard = 0; guard < 200 && pos < limit; guard += 1) {
    const mention = mentions.find((m) => m.start === pos);
    if (mention) {
      addMention(list, mention);
      if (mention.ref.type === "country" && !mention.ref.guessed) named.add(mention.ref.country);
      pos = mention.end;
      list.end = pos;
      const suffix = SUFFIX_RE.exec(text.slice(pos, limit));
      if (suffix) {
        pos += suffix[0].length;
        list.end = pos;
      }
      // "Austin, TX", "Toronto, ON": a state or province code after a US or Canadian city.
      const code = /^,\s*([A-Z]{2})\b/.exec(text.slice(pos, limit));
      const country = mention.ref.type === "country" ? mention.ref.country : null;
      if (
        code?.[1] &&
        ((country === "US" && isUsStateAbbreviation(code[1])) ||
          (country === "CA" && isCanadianProvinceAbbreviation(code[1])))
      ) {
        pos += code[0].length;
        list.end = pos;
      }
      sawSeparator = false;
      continue;
    }
    // B3 C2: "one of the following states: CA, NY, TX" lists US state codes. B4: so does a run of
    // two or more state codes ("Must reside in AZ, CA, CO, TX").
    if (!statesContext && list.mentions.length === 0) {
      const run = /^[A-Z]{2}(?:\s*(?:,|\/|&|\bor\b|\band\b)\s*[A-Z]{2}\b)+/.exec(
        text.slice(pos, limit),
      );
      if (run && run[0].match(/[A-Z]{2}/g)?.every((code) => isUsStateAbbreviation(code))) {
        statesContext = true;
      }
    }
    const stateCode = statesContext ? /^([A-Z]{2})\b/.exec(text.slice(pos, limit)) : null;
    if (stateCode?.[1] && isUsStateAbbreviation(stateCode[1])) {
      if (!list.countries.includes("US")) list.countries.push("US");
      named.add("US");
      list.hasLocalities = true;
      pos += stateCode[0].length;
      list.end = pos;
      sawSeparator = false;
      continue;
    }
    // "a country where we have an entity: UK, Germany" introduces the list.
    const intro = ENTITY_INTRO_RE.exec(text.slice(pos, limit));
    if (intro) {
      list.entityIntro = true;
      pos += intro[0].length;
      continue;
    }
    const filler = FILLER_RE.exec(text.slice(pos, limit));
    if (filler && filler[0].length > 0) {
      if (/[,;/&|]|\b(?:and|or)\b/i.test(filler[0])) sawSeparator = true;
      if (/\bstates\b/i.test(filler[0])) statesContext = true;
      pos += filler[0].length;
      continue;
    }
    // An unknown capitalised word right after a separator inside a list may be a place we do not
    // know ("Poland, Romania, Transnistria"). Only flag it when the list already has places.
    if (list.mentions.length > 0 && sawSeparator) {
      const word = /^[A-ZÀ-Ý][\p{L}'’.-]+/u.exec(text.slice(pos, limit))?.[0];
      if (word && !COMMON_CAPITALISED.has(word)) list.ambiguous.push(word);
    }
    break;
  }
  list.guessed = list.countries.filter((country) => !named.has(country));
  const tail = text.slice(list.end, limit);
  list.only = ONLY_RE.test(tail);
  list.timezone = TIMEZONE_RE.test(tail);
  return list;
}

function addMention(list: PlaceList, mention: PlaceMention): void {
  list.mentions.push(mention);
  const ref = mention.ref;
  if (ref.type === "country") {
    if (!list.countries.includes(ref.country)) list.countries.push(ref.country);
    if (ref.via !== "country") list.hasLocalities = true;
  } else if (ref.type === "region") {
    if (!list.regions.includes(ref.region)) list.regions.push(ref.region);
  } else {
    list.ambiguous.push(mention.text);
  }
}

/** Capitalised words that end a list without being places. */
const COMMON_CAPITALISED = new Set([
  "We",
  "You",
  "Our",
  "The",
  "This",
  "That",
  "These",
  "Those",
  "It",
  "If",
  "In",
  "At",
  "As",
  "For",
  "And",
  "Or",
  "But",
  "With",
  "What",
  "Why",
  "How",
  "Who",
  "Where",
  "When",
  "Please",
  "Note",
  "Candidates",
  "Applicants",
  "Apply",
  "Applications",
  "Remote",
  "Hybrid",
  "Onsite",
  "Office",
  "Fluent",
  "English",
  "Bonus",
  "Compensation",
  "Salary",
  "Benefits",
  "Requirements",
  "Location",
  "Responsibilities",
  "About",
  "Experience",
  "Strong",
  "Ability",
  "Must",
  "Nice",
  "Preferred",
  "Time",
  "Timezone",
  "Start",
  "Duration",
  "Type",
  "Status",
  "Department",
  "Reports",
  "Travel",
  "Engagement",
  "Working",
  "Hours",
  "Rate",
  "Only",
  "All",
  "Any",
  "No",
  "Yes",
  "Visa",
  "Sponsorship",
  "Relocation",
  "Contract",
  "Employment",
  "Full",
  "Part",
  "Monday",
  "Friday",
  "January",
  "EST",
  "CET",
  "UTC",
  "GMT",
  "PST",
  "Perks",
  "Your",
  "They",
  "Their",
  "Please",
  "Additional",
  "Other",
]);
