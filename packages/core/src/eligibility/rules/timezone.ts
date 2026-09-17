// Timezone constraints in one sentence: "CET ± 3", "UTC-3 to UTC+3", "within 2 hours of GMT+2",
// "4 hours overlap with EST", "US time zones", "9am-5pm PT". Isomorphic.

import type { CountryCode } from "../regions/countries";
import type { RegionCode } from "../regions/groups";
import type { PlaceMention } from "../regions/match";
import {
  CITY_ZONE_OFFSETS,
  PLACE_ZONE_RANGES,
  SHORT_US_ZONES,
  ZONE_OFFSETS,
} from "../regions/timezones";
import type { SignalStrength, TimezoneConstraint, UtcOffsetRange } from "../signals";
import { PREFERENCE_RE } from "./text";

export interface TimezoneHit {
  constraint: TimezoneConstraint;
  strength: SignalStrength;
}

const ZONE_NAMES = [...ZONE_OFFSETS.keys()].sort((a, b) => b.length - a.length);
const ZONE_ALT = ZONE_NAMES.map((z) => z.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
const OFFSET = String.raw`(?:\s?([+\-−–])\s?(\d{1,2})(?:[:.]?(\d{2}))?)?`;
/** A zone with an optional offset: "UTC", "GMT+2", "UTC -5:30", "CEST". Groups: name, sign, h, m. */
const ZONE = String.raw`(?<![\p{L}\p{N}])(${ZONE_ALT})(?![\p{L}])${OFFSET}`;
const CLOCK = String.raw`\d{1,2}(?:[:.]\d{2})?\s?(?:[ap]\.?m\.?)?`;

const ZONE_RE = new RegExp(ZONE, "gu");
const PLUS_MINUS_RE = new RegExp(
  String.raw`${ZONE}\s*\(?\s*(?:±|\+\/-|\+\/−|\+-|\+ ?\/ ?-|plus or minus|plus\/minus)\s*(\d{1,2})(?:\s*(?:hours?|hrs?|h)\b)?`,
  "gu",
);
const RANGE_RE = new RegExp(
  String.raw`${ZONE}\s*(?:to|and|through|until|-{1,2}|–|—)\s*${ZONE}`,
  "gu",
);
const WITHIN_HOURS_RE = new RegExp(
  String.raw`(?:within|up to|max(?:imum)?(?: of)?|no more than)\s+(?:\+\/-\s*)?(?:(\d{1,2})\s*[-–]\s*)?(\d{1,2})\s*(?:hours?|hrs?|h)\b(?:\s+(?:time\s+)?difference)?\s+(?:of|from|to|with)\s+(?:the\s+)?(?:(that|this|the same)\s+time\s?zone|${ZONE})`,
  "giu",
);
const SCHEDULE_RE = new RegExp(
  String.raw`(${CLOCK})\s*(?:-|–|—|to|until)\s*(${CLOCK})\s*\(?\s*${ZONE}`,
  "giu",
);
// B4: a city used as a clock ("within 2 hours of London time", "Kyiv time ± 2h", "New York hours").
const CITY_ALT = [...CITY_ZONE_OFFSETS.keys()]
  .sort((a, b) => b.length - a.length)
  .map((z) => z.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  .join("|");
const CITY_CLOCK = String.raw`(?<![\p{L}])(${CITY_ALT})(?![\p{L}])(?:\s+(?:[Ss]tandard|[Ll]ocal|[Oo]ffice|[Bb]usiness|[Ww]orking|[Ww]ork))?\s+([Tt]ime(?:\s?[Zz]ones?)?|[Tt]imezones?|[Hh]ours|TIME|HOURS)(?![\p{L}])`;
const CITY_WITHIN_RE = new RegExp(
  String.raw`(?:[Ww]ithin|[Uu]p to|[Mm]ax(?:imum)?(?: of)?|[Nn]o more than|\+\/-|±)\s*(?:(\d{1,2})\s*[-–]\s*)?(\d{1,2})\s*(?:hours?|hrs?|h)(?![\p{L}])(?:\s+(?:time\s+)?difference)?\s+(?:of|from|to|with)\s+(?:the\s+)?${CITY_CLOCK}`,
  "gu",
);
const CITY_PLUS_MINUS_RE = new RegExp(
  String.raw`${CITY_CLOCK}\s*\(?\s*(?:±|\+\/-|\+\/−|\+-|plus or minus|plus\/minus)\s*(\d{1,2})(?:\s*(?:hours?|hrs?|h)(?![\p{L}]))?`,
  "gu",
);
const CITY_BARE_RE = new RegExp(CITY_CLOCK, "gu");
/** B4: IANA zone names ("Time zone: Europe/Kyiv", "America/New_York"). */
const IANA_RE = /\b(?:Europe|America|Asia|Africa|Australia|Pacific|Atlantic)\/([A-Z][A-Za-z_]+)\b/g;

/** Requirement words that keep an overlap band required. */
const OVERLAP_REQUIRED_RE =
  /\b(?:must|required|requires?|requirement|need(?:s|ed)? to|have to|has to|mandatory|at least|minimum|non-negotiable|strictly)\b/i;

const REQUIRED_RE =
  /\b(?:must|required|requires?|requirement|need(?:s|ed)? to|only|non-negotiable|strictly|mandatory)\b/i;

const ZONE_OFFSETS_LOWER = new Map([...ZONE_OFFSETS].map(([k, v]) => [k.toLowerCase(), v]));

function offsetOf(name: string, sign?: string, hours?: string, minutes?: string): number | null {
  // B3 C2: case-insensitive ("9am-5pm Pacific time").
  const base = ZONE_OFFSETS.get(name) ?? ZONE_OFFSETS_LOWER.get(name.toLowerCase());
  if (base === undefined) return null;
  if (!hours) return base;
  const value = Number(hours) + (minutes ? Number(minutes) / 60 : 0);
  if (value > 14) return null;
  return base + (sign === "-" || sign === "−" || sign === "–" ? -value : value);
}

/** Short US zone names ("ET", "PT") are zones only next to a clock time, "time", "hours" or "/". */
function shortZoneOk(sentence: string, start: number, end: number, name: string): boolean {
  if (!SHORT_US_ZONES.has(name)) return true;
  const before = sentence.slice(Math.max(0, start - 12), start);
  const after = sentence.slice(end, end + 16);
  if (name.length > 2) {
    // Zone words ("Pacific") need "time" or "hours" right after, so "Asia-Pacific" never counts.
    // B4: or a clock range right before ("9am–5pm Eastern").
    return (
      /^\s*(?:standard\s+)?(?:time|hours|business hours|working hours)\b/i.test(after) ||
      new RegExp(String.raw`\d\s?(?:[ap]\.?m\.?)?\s*$`, "i").test(before)
    );
  }
  return (
    new RegExp(String.raw`${CLOCK}\s*[(\-–]?\s*$`, "i").test(before) ||
    /^\s*(?:time|hours|business hours|\/|\))/i.test(after) ||
    /[/–-]\s*$/.test(before)
  );
}

const range = (a: number, b: number): UtcOffsetRange => ({
  minOffset: Math.min(a, b),
  maxOffset: Math.max(a, b),
});

function strengthOf(sentence: string): SignalStrength {
  if (PREFERENCE_RE.test(sentence)) return "weak";
  return REQUIRED_RE.test(sentence) ? "explicit" : "implied";
}

function clockHours(from: string, to: string): number | null {
  const parse = (value: string) => {
    const m = /^(\d{1,2})(?:[:.](\d{2}))?\s?([ap])?/i.exec(value.trim());
    if (!m) return null;
    let h = Number(m[1]) + (m[2] ? Number(m[2]) / 60 : 0);
    if (m[3]?.toLowerCase() === "p" && h < 12) h += 12;
    return h;
  };
  const a = parse(from);
  const b = parse(to);
  if (a === null || b === null) return null;
  const span = b >= a ? b - a : b + 24 - a;
  return span > 0 && span <= 16 ? span : null;
}

/**
 * Timezone constraints in `sentence`. `mentions` are the place mentions of the same sentence, used
 * for "US time zones". Returns at most one constraint per distinct cue.
 */
export function extractTimezoneHits(
  sentence: string,
  mentions: readonly PlaceMention[],
): TimezoneHit[] {
  const hits: TimezoneHit[] = [];
  const covered: Array<[number, number]> = [];
  const isCovered = (start: number, end: number) => covered.some(([s, e]) => start < e && end > s);
  const overlapCue = /\boverlap/i.test(sentence);
  const overlapHoursMatch =
    /(?<![±/+-]\s*)(\d{1,2})\s*\+?\s*(?:-|to)?\s*(?:\d{1,2}\s*)?(?:hours?|hrs?)\b[^.]{0,30}\boverlap|\boverlap[^.]{0,40}?(\d{1,2})\s*\+?\s*(?:hours?|hrs?)\b|(\d{1,2})-hour overlap/i.exec(
      sentence,
    );
  const overlapHours = overlapHoursMatch
    ? Number(overlapHoursMatch[1] ?? overlapHoursMatch[2] ?? overlapHoursMatch[3])
    : null;
  // B4c: "overlap with EST" with no hours and no requirement word is a preferred band.
  const preferredOverlap =
    overlapCue &&
    overlapHours === null &&
    !/\d\s*(?:hours?|hrs?|h)\b/i.test(sentence) &&
    !OVERLAP_REQUIRED_RE.test(sentence);
  const strength: SignalStrength = preferredOverlap ? "weak" : strengthOf(sentence);
  const push = (
    start: number,
    end: number,
    constraint: TimezoneConstraint,
    hitStrength = strength,
  ) => {
    covered.push([start, end]);
    hits.push({ constraint, strength: hitStrength });
  };

  for (const m of sentence.matchAll(IANA_RE)) {
    const offset = CITY_ZONE_OFFSETS.get((m[1] ?? "").replace(/_/g, " "));
    if (offset === undefined) continue;
    push(m.index, m.index + m[0].length, {
      mode: overlapCue ? "overlap" : "within",
      ranges: [range(offset, offset)],
      overlapHours: overlapCue ? overlapHours : null,
    });
  }
  for (const m of sentence.matchAll(CITY_WITHIN_RE)) {
    const [, low, high = "0", city = ""] = m;
    const offset = CITY_ZONE_OFFSETS.get(city);
    if (offset === undefined) continue;
    const n = Number(high || low);
    push(m.index, m.index + m[0].length, {
      mode: "within",
      ranges: [range(offset - n, offset + n)],
      overlapHours: null,
    });
  }
  for (const m of sentence.matchAll(CITY_PLUS_MINUS_RE)) {
    if (isCovered(m.index, m.index + m[0].length)) continue;
    const [, city = "", , spread = "0"] = m;
    const offset = CITY_ZONE_OFFSETS.get(city);
    const n = Number(spread);
    if (offset === undefined || n > 12) continue;
    push(m.index, m.index + m[0].length, {
      mode: overlapCue ? "overlap" : "within",
      ranges: [range(offset - n, offset + n)],
      overlapHours: overlapCue ? overlapHours : null,
    });
  }
  for (const m of sentence.matchAll(CITY_BARE_RE)) {
    if (isCovered(m.index, m.index + m[0].length)) continue;
    const [, city = "", word = ""] = m;
    const offset = CITY_ZONE_OFFSETS.get(city);
    if (offset === undefined) continue;
    // "based in London time zone" reads as a zone; "London hours" is the working day there.
    const hours = /hours/i.test(word);
    push(m.index, m.index + m[0].length, {
      mode: hours || overlapCue ? "overlap" : "within",
      ranges: [range(offset, offset)],
      overlapHours: overlapCue ? overlapHours : hours ? "full" : null,
    });
  }

  for (const m of sentence.matchAll(SCHEDULE_RE)) {
    const [, from = "", to = "", name = "", sign, h, min] = m;
    const zoneStart = m.index + m[0].lastIndexOf(name);
    if (!shortZoneOk(sentence, zoneStart, zoneStart + name.length, name)) continue;
    const offset = offsetOf(name, sign, h, min);
    if (offset === null) continue;
    const core = /\bcore hours|\boverlap/i.test(sentence);
    push(m.index, m.index + m[0].length, {
      mode: "overlap",
      ranges: [range(offset, offset)],
      overlapHours: core ? (overlapHours ?? clockHours(from, to)) : "full",
    });
  }

  for (const m of sentence.matchAll(PLUS_MINUS_RE)) {
    if (isCovered(m.index, m.index + m[0].length)) continue;
    const [, name = "", sign, h, min, spread] = m;
    const offset = offsetOf(name, sign, h, min);
    if (offset === null || !spread) continue;
    const n = Number(spread);
    if (n > 12 || /^\s*min/i.test(sentence.slice(m.index + m[0].length))) continue;
    push(m.index, m.index + m[0].length, {
      mode: overlapCue ? "overlap" : "within",
      ranges: [range(offset - n, offset + n)],
      overlapHours: overlapCue ? overlapHours : null,
    });
  }

  for (const m of sentence.matchAll(RANGE_RE)) {
    if (isCovered(m.index, m.index + m[0].length)) continue;
    const before = sentence.slice(Math.max(0, m.index - 10), m.index);
    if (new RegExp(String.raw`${CLOCK}\s*$`, "i").test(before) && /\d/.test(before)) continue;
    const [, n1 = "", s1, h1, m1, n2 = "", s2, h2, m2] = m;
    const a = offsetOf(n1, s1, h1, m1);
    const b = offsetOf(n2, s2, h2, m2);
    if (a === null || b === null) continue;
    push(m.index, m.index + m[0].length, {
      mode: overlapCue ? "overlap" : "within",
      ranges: [range(a, b)],
      overlapHours: overlapCue ? overlapHours : null,
    });
  }

  let lastOffset: number | null = null;
  for (const m of sentence.matchAll(WITHIN_HOURS_RE)) {
    if (isCovered(m.index, m.index + m[0].length)) continue;
    const [, low, high = "0", sameZone, name, sign, h, min] = m;
    let offset: number | null = null;
    if (sameZone) {
      const earlier = [...sentence.slice(0, m.index).matchAll(ZONE_RE)].pop();
      if (earlier) offset = offsetOf(earlier[1] ?? "", earlier[2], earlier[3], earlier[4]);
    } else if (name) {
      offset = offsetOf(name, sign, h, min);
    }
    if (offset === null) continue;
    lastOffset = offset;
    const n = Number(high || low);
    // "GMT +1 or within 1-2hrs of that timezone": drop an earlier bare-zone hit for the same zone.
    push(m.index, m.index + m[0].length, {
      mode: "within",
      ranges: [range(offset - n, offset + n)],
      overlapHours: null,
    });
  }

  // "US time zones", "European time zones", "ANZ or PST timezone".
  const zonePlaces: { countries: CountryCode[]; regions: RegionCode[]; ranges: UtcOffsetRange[] } =
    {
      countries: [],
      regions: [],
      ranges: [],
    };
  let zonePlaceStart = -1;
  for (const mention of mentions) {
    const after = sentence.slice(mention.end, mention.end + 40);
    if (
      !/^\s*(?:(?:or|and|\/|,)\s*[\p{L} /]{0,12}?\s*)?(?:time\s?zones?|timezones?|business hours|working hours|hours)\b/iu.test(
        after,
      )
    ) {
      continue;
    }
    if (isCovered(mention.start, mention.end)) continue;
    const ref = mention.ref;
    const key = ref.type === "country" ? ref.country : ref.type === "region" ? ref.region : null;
    if (!key) continue;
    if (ref.type === "country") zonePlaces.countries.push(ref.country);
    if (ref.type === "region") zonePlaces.regions.push(ref.region);
    const known = PLACE_ZONE_RANGES.get(key);
    if (known) zonePlaces.ranges.push(known);
    if (zonePlaceStart < 0) zonePlaceStart = mention.start;
  }

  // Bare zones used as a requirement: "work within CEST timezone", "EST/EDT hours", "PST timezone".
  const bareRanges: UtcOffsetRange[] = [];
  for (const m of sentence.matchAll(ZONE_RE)) {
    const end = m.index + m[0].length;
    if (isCovered(m.index, end)) continue;
    const [, name = "", sign, h, min] = m;
    if (!shortZoneOk(sentence, m.index, end, name)) continue;
    const after = sentence.slice(end, end + 30);
    const before = sentence.slice(Math.max(0, m.index - 40), m.index);
    const zoneWord =
      /^\s*(?:\/\s*[A-Z]{2,4}\s*)?(?:time\s?zones?|timezones?|hours|business hours|working hours|time)\b/i.test(
        after,
      );
    const lead =
      /\b(?:in|within|on|from|with|based in|located in|aligned (?:to|with)|compatible with|overlap(?:s|ping)? with|hours:?|timezone:?|time zone:?)\s*(?:the\s+|either\s+(?:the\s+)?)?$/i.test(
        before,
      );
    if (!zoneWord && !lead) continue;
    const offset = offsetOf(name, sign, h, min);
    if (offset === null) continue;
    if (lastOffset !== null && lastOffset === offset) continue;
    bareRanges.push(range(offset, offset));
    covered.push([m.index, end]);
  }

  if (zonePlaceStart >= 0 || bareRanges.length > 0) {
    const workingHours = /\b(?:business|working|work) hours|\bhours\b|\boverlap/i.test(sentence);
    // B3 C2: "must work US Pacific business hours" is the whole working day in that zone.
    const fullDay =
      overlapHours === null &&
      /\b(?:must|required to|need to|needs to|have to|has to|will)\s+(?:be\s+available\s+(?:during\s+)?|work\s+(?:during\s+|in\s+)?)[^.;]{0,30}\b(?:business|working|office)\s+hours\b/i.test(
        sentence,
      );
    const constraint: TimezoneConstraint = {
      mode: workingHours ? "overlap" : "within",
      ranges: [...zonePlaces.ranges, ...bareRanges],
      overlapHours: workingHours ? (fullDay ? "full" : overlapHours) : null,
    };
    if (zonePlaceStart >= 0) {
      constraint.places = { countries: zonePlaces.countries, regions: zonePlaces.regions };
    }
    hits.push({ constraint, strength });
  }
  return hits;
}
