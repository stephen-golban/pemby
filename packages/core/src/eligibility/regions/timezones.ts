// Timezone bands: abbreviations posts use, UTC offsets per country (standard and daylight time),
// and a membership test for "is this country inside UTC-3..UTC+3". Isomorphic.
//
// Offsets come from the IANA tz database, release 2026b, read through Node 24's ICU on 2026-09-17
// (Intl.DateTimeFormat with timeZoneName "longOffset" on 2026-01-15 and 2026-07-15):
//   Europe/Chisinau +2/+3, Europe/Kyiv +2/+3, Asia/Tbilisi +4/+4 (no DST), Asia/Yerevan +4/+4
//   (no DST), Europe/Belgrade, Sarajevo, Podgorica, Skopje, Tirane +1/+2, Europe/Istanbul +3,
//   Europe/Moscow +3, America/Sao_Paulo -3, Asia/Kolkata +5:30.
// Every entry in COUNTRY_OFFSETS was checked the same way (multi-zone countries across their
// extreme zones, e.g. Pacific/Honolulu to America/New_York, Australia/Perth to Lord_Howe).
// Kosovo has no own tz zone; it follows Europe/Belgrade (CET/CEST).
// Ukraine: a 2024 bill to abolish clock changes was not signed, so DST still applies in 2026
// [secondary]: https://kyivindependent.com/zelensky-wont-sign-bill-to-end-daylight-saving-time-media-says/

import type { UtcOffsetRange } from "../signals";
import type { CountryCode } from "./countries";
import type { MembershipConfidence } from "./groups";

/**
 * Zone abbreviations and names with their UTC offset in hours. Left out as ambiguous: IST (India,
 * Ireland, Israel), AMT, GST in lower case, "CT"/"ET"/"PT" (matched only next to clock times).
 * CST is read as US Central (-6): in English job posts it almost never means China.
 */
export const ZONE_OFFSETS: ReadonlyMap<string, number> = new Map([
  ["UTC", 0],
  ["GMT", 0],
  ["WET", 0],
  ["WEST", 1],
  ["BST", 1],
  ["CET", 1],
  ["CEST", 2],
  ["EET", 2],
  ["EEST", 3],
  ["MSK", 3],
  ["TRT", 3],
  ["GST", 4],
  ["PKT", 5],
  ["SGT", 8],
  ["HKT", 8],
  ["JST", 9],
  ["KST", 9],
  ["AEST", 10],
  ["AEDT", 11],
  ["NZST", 12],
  ["NZDT", 13],
  ["EST", -5],
  ["EDT", -4],
  ["ET", -5],
  ["CST", -6],
  ["CDT", -5],
  ["CT", -6],
  ["MST", -7],
  ["MDT", -6],
  ["MT", -7],
  ["PST", -8],
  ["PDT", -7],
  ["PT", -8],
  ["AKST", -9],
  ["HST", -10],
  ["BRT", -3],
  ["ART", -3],
  ["Central European Time", 1],
  ["Central European Summer Time", 2],
  ["Central European", 1],
  ["Eastern European Time", 2],
  ["Eastern European Summer Time", 3],
  ["Western European Time", 0],
  ["Greenwich Mean Time", 0],
  ["Eastern Time", -5],
  ["Eastern Standard Time", -5],
  ["Central Time", -6],
  ["Central Standard Time", -6],
  ["Mountain Time", -7],
  ["Pacific Time", -8],
  ["Pacific Standard Time", -8],
  ["East Coast", -5],
  ["East coast", -5],
  ["east coast", -5],
  ["West coast", -8],
  ["west coast", -8],
  // B3 C2: US zone words; only zones next to "time" or "(business) hours" (see SHORT_US_ZONES).
  ["Pacific", -8],
  ["Eastern", -5],
  ["Mountain", -7],
  ["Central", -6],
  ["West Coast", -8],
]);

/**
 * B4: cities posts use as a clock ("within 2 hours of London time", "Kyiv time ± 2h", "New York
 * hours"), with their standard-time offset. Only read next to "time" or "hours" (rules/timezone.ts),
 * never as zone names on their own ("based in London" is a place, not a zone).
 */
export const CITY_ZONE_OFFSETS: ReadonlyMap<string, number> = new Map([
  ["London", 0],
  ["Dublin", 0],
  ["Lisbon", 0],
  ["Berlin", 1],
  ["Paris", 1],
  ["Amsterdam", 1],
  ["Madrid", 1],
  ["Warsaw", 1],
  ["Prague", 1],
  ["Vienna", 1],
  ["Stockholm", 1],
  ["Belgrade", 1],
  ["Kyiv", 2],
  ["Kiev", 2],
  ["Chisinau", 2],
  ["Chișinău", 2],
  ["Bucharest", 2],
  ["Athens", 2],
  ["Helsinki", 2],
  ["Sofia", 2],
  ["Tel Aviv", 2],
  ["Istanbul", 3],
  ["Moscow", 3],
  ["Tbilisi", 4],
  ["Yerevan", 4],
  ["Dubai", 4],
  ["India", 5.5],
  ["Bangalore", 5.5],
  ["Bengaluru", 5.5],
  ["Singapore", 8],
  ["Manila", 8],
  ["Tokyo", 9],
  ["Sydney", 10],
  ["Melbourne", 10],
  ["Auckland", 12],
  ["New York", -5],
  ["NYC", -5],
  ["Boston", -5],
  ["Toronto", -5],
  ["Miami", -5],
  ["Chicago", -6],
  ["Austin", -6],
  ["Dallas", -6],
  ["Mexico City", -6],
  ["Denver", -7],
  ["San Francisco", -8],
  ["SF", -8],
  ["Los Angeles", -8],
  ["LA", -8],
  ["Seattle", -8],
  ["Vancouver", -8],
  ["São Paulo", -3],
  ["Sao Paulo", -3],
  ["Buenos Aires", -3],
]);

/** Two-letter US zone names are only zones next to a clock time or "time"; see rules/timezone.ts. */
export const SHORT_US_ZONES: ReadonlySet<string> = new Set([
  "ET",
  "CT",
  "MT",
  "PT",
  "Pacific",
  "Eastern",
  "Mountain",
  "Central",
]);

export interface CountryOffsets {
  /** Standard-time offsets across the country's zones. */
  standard: UtcOffsetRange;
  /** Daylight-time offsets, or null when no zone observes DST. */
  daylight: UtcOffsetRange | null;
}

const r = (minOffset: number, maxOffset = minOffset): UtcOffsetRange => ({ minOffset, maxOffset });

/** Target countries and the markets posts most often anchor to. Multi-zone countries are ranges. */
export const COUNTRY_OFFSETS: ReadonlyMap<CountryCode, CountryOffsets> = new Map([
  // Targets.
  ["MD", { standard: r(2), daylight: r(3) }],
  ["UA", { standard: r(2), daylight: r(3) }],
  ["GE", { standard: r(4), daylight: null }],
  ["AM", { standard: r(4), daylight: null }],
  ["RS", { standard: r(1), daylight: r(2) }],
  ["BA", { standard: r(1), daylight: r(2) }],
  ["ME", { standard: r(1), daylight: r(2) }],
  ["MK", { standard: r(1), daylight: r(2) }],
  ["AL", { standard: r(1), daylight: r(2) }],
  ["XK", { standard: r(1), daylight: r(2) }],
  // Europe.
  ["GB", { standard: r(0), daylight: r(1) }],
  ["IE", { standard: r(0), daylight: r(1) }],
  ["PT", { standard: r(-1, 0), daylight: r(0, 1) }],
  ["ES", { standard: r(0, 1), daylight: r(1, 2) }],
  ["FR", { standard: r(1), daylight: r(2) }],
  ["DE", { standard: r(1), daylight: r(2) }],
  ["NL", { standard: r(1), daylight: r(2) }],
  ["BE", { standard: r(1), daylight: r(2) }],
  ["IT", { standard: r(1), daylight: r(2) }],
  ["CH", { standard: r(1), daylight: r(2) }],
  ["AT", { standard: r(1), daylight: r(2) }],
  ["PL", { standard: r(1), daylight: r(2) }],
  ["CZ", { standard: r(1), daylight: r(2) }],
  ["SK", { standard: r(1), daylight: r(2) }],
  ["HU", { standard: r(1), daylight: r(2) }],
  ["HR", { standard: r(1), daylight: r(2) }],
  ["SI", { standard: r(1), daylight: r(2) }],
  ["SE", { standard: r(1), daylight: r(2) }],
  ["NO", { standard: r(1), daylight: r(2) }],
  ["DK", { standard: r(1), daylight: r(2) }],
  ["FI", { standard: r(2), daylight: r(3) }],
  ["EE", { standard: r(2), daylight: r(3) }],
  ["LV", { standard: r(2), daylight: r(3) }],
  ["LT", { standard: r(2), daylight: r(3) }],
  ["RO", { standard: r(2), daylight: r(3) }],
  ["BG", { standard: r(2), daylight: r(3) }],
  ["GR", { standard: r(2), daylight: r(3) }],
  ["CY", { standard: r(2), daylight: r(3) }],
  ["TR", { standard: r(3), daylight: null }],
  ["BY", { standard: r(3), daylight: null }],
  ["AZ", { standard: r(4), daylight: null }],
  ["IL", { standard: r(2), daylight: r(3) }],
  ["AE", { standard: r(4), daylight: null }],
  ["EG", { standard: r(2), daylight: r(3) }],
  // Americas.
  ["US", { standard: r(-10, -5), daylight: r(-10, -4) }],
  ["CA", { standard: r(-8, -3.5), daylight: r(-7, -2.5) }],
  ["MX", { standard: r(-8, -5), daylight: r(-7, -5) }],
  ["BR", { standard: r(-5, -2), daylight: null }],
  ["AR", { standard: r(-3), daylight: null }],
  ["CO", { standard: r(-5), daylight: null }],
  ["CL", { standard: r(-4), daylight: r(-3) }],
  ["PE", { standard: r(-5), daylight: null }],
  ["UY", { standard: r(-3), daylight: null }],
  // Asia, Africa, Oceania.
  ["IN", { standard: r(5.5), daylight: null }],
  ["PK", { standard: r(5), daylight: null }],
  ["BD", { standard: r(6), daylight: null }],
  ["PH", { standard: r(8), daylight: null }],
  ["VN", { standard: r(7), daylight: null }],
  ["SG", { standard: r(8), daylight: null }],
  ["JP", { standard: r(9), daylight: null }],
  ["KR", { standard: r(9), daylight: null }],
  ["CN", { standard: r(8), daylight: null }],
  ["AU", { standard: r(8, 10.5), daylight: r(8, 11) }],
  ["NZ", { standard: r(12), daylight: r(13) }],
  ["NG", { standard: r(1), daylight: null }],
  ["KE", { standard: r(3), daylight: null }],
  ["ZA", { standard: r(2), daylight: null }],
]);

/**
 * Offset ranges for "X time zones" phrases, keyed by country or region code. Conservative: the
 * range spans the standard-time offsets of the places employers usually mean.
 */
export const PLACE_ZONE_RANGES: ReadonlyMap<string, UtcOffsetRange> = new Map([
  ["US", r(-8, -5)],
  ["CA", r(-8, -3.5)],
  ["NORTH_AMERICA", r(-8, -5)],
  ["AMERICAS", r(-8, -3)],
  ["LATAM", r(-6, -3)],
  ["EUROPE", r(0, 2)],
  ["EU", r(0, 2)],
  ["EMEA", r(0, 3)],
  ["GB", r(0)],
  ["UKI", r(0)],
  ["APAC", r(5.5, 12)],
  ["ANZ", r(8, 12)],
  ["AU", r(8, 10.5)],
  ["IN", r(5.5)],
]);

function inside(range: UtcOffsetRange, band: UtcOffsetRange): boolean {
  return range.minOffset >= band.minOffset && range.maxOffset <= band.maxOffset;
}

function disjoint(range: UtcOffsetRange, band: UtcOffsetRange): boolean {
  return range.maxOffset < band.minOffset || range.minOffset > band.maxOffset;
}

/**
 * Whether a country's working clock falls inside a band, all year and in every zone.
 * - inside in both standard and daylight time: contains, certain;
 * - outside in both: not contained, certain;
 * - inside only part of the year or only some zones (Moldova in "GMT-8 to GMT+2": +2 in winter,
 *   +3 in summer): not contained, ambiguous.
 * Returns null for countries without offset data.
 */
export function bandContainsCountry(
  band: UtcOffsetRange,
  country: CountryCode,
): { contains: boolean; confidence: MembershipConfidence } | null {
  const offsets = COUNTRY_OFFSETS.get(country.toUpperCase());
  if (!offsets) return null;
  const ranges = offsets.daylight ? [offsets.standard, offsets.daylight] : [offsets.standard];
  if (ranges.every((range) => inside(range, band)))
    return { contains: true, confidence: "certain" };
  if (ranges.every((range) => disjoint(range, band))) {
    return { contains: false, confidence: "certain" };
  }
  return { contains: false, confidence: "ambiguous" };
}
