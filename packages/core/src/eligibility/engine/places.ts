// Place and time-zone matching for the eligibility engine: does a signal's scope contain one
// country, and does a working-hours constraint fit it. Isomorphic.

import { countryName, type CountryCode } from "../regions/countries";
import { DATED_MEMBERSHIPS } from "../regions/dated";
import {
  regionContains,
  regionInfo,
  regionMembershipDetail,
  type MembershipConfidence,
  type RegionCode,
  type RegionMembership,
} from "../regions/groups";
import { lookupPlace } from "../regions/match";
import { COUNTRY_OFFSETS, bandContainsCountry } from "../regions/timezones";
import type { SignalScopes, TimezoneConstraint, UtcOffsetRange } from "../signals";

export { DATED_MEMBERSHIPS };

export function membershipAt(
  region: RegionCode,
  country: CountryCode,
  now: Date,
): RegionMembership {
  const dated = DATED_MEMBERSHIPS.filter(
    (d) => d.region === region && d.country === country && now.getTime() >= d.from.getTime(),
  ).sort((a, b) => b.from.getTime() - a.from.getTime())[0];
  return dated ? dated.membership : regionContains(region, country);
}

export type ScopeMatch =
  /** No places in the scope. */
  | { match: "empty" }
  /** The country itself (or a city or subdivision in it) is named. */
  | { match: "country" }
  /** A named region contains the country. */
  | { match: "region"; region: RegionCode; confidence: MembershipConfidence }
  /** No scope contains the country, but a region may (ambiguous outside). */
  | { match: "unclear"; region: RegionCode }
  /** Every scope leaves the country out (certain or likely). */
  | { match: "outside" };

const CONFIDENCE_RANK: Record<MembershipConfidence, number> = {
  certain: 0,
  likely: 1,
  ambiguous: 2,
};

export function matchScopes(scopes: SignalScopes, country: CountryCode, now: Date): ScopeMatch {
  if (scopes.countries.length === 0 && scopes.regions.length === 0) return { match: "empty" };
  if (scopes.countries.includes(country)) return { match: "country" };
  let inside: { region: RegionCode; confidence: MembershipConfidence } | null = null;
  let unclear: RegionCode | null = null;
  for (const region of scopes.regions) {
    const m = membershipAt(region, country, now);
    if (m.contains) {
      if (!inside || CONFIDENCE_RANK[m.confidence] < CONFIDENCE_RANK[inside.confidence]) {
        inside = { region, confidence: m.confidence };
      }
    } else if (m.confidence === "ambiguous" && !unclear) {
      unclear = region;
    }
  }
  if (inside) return { match: "region", ...inside };
  if (unclear) return { match: "unclear", region: unclear };
  return { match: "outside" };
}

export type ExclusionMatch =
  /** The country is named, or a region contains it (certain or likely). */
  | { match: "excluded" }
  /** A region's colloquial reading covers it ("CIS" for Georgia, Ukraine, Moldova after 2027). */
  | { match: "colloquial"; label: string }
  /**
   * A region may cover it: contains ambiguously, or is outside only likely or ambiguously
   * (colloquial usage), or the country was only guessed.
   */
  | { match: "unclear"; label: string }
  | { match: "outside" };

/** How an exclusion bears on one country. Only a certain outside (or no place) is "outside". */
export function exclusionMatch(
  scopes: SignalScopes,
  country: CountryCode,
  now: Date,
  guessed: boolean,
): ExclusionMatch {
  if (scopes.countries.includes(country)) {
    return guessed
      ? { match: "unclear", label: countryName(country) ?? country }
      : { match: "excluded" };
  }
  let unclear: RegionCode | null = null;
  let colloquial: RegionCode | null = null;
  for (const region of scopes.regions) {
    const m = membershipAt(region, country, now);
    if (m.contains && m.confidence !== "ambiguous") return { match: "excluded" };
    if (regionMembershipDetail(region, country).colloquial !== null) colloquial ??= region;
    else if (m.confidence !== "certain") unclear ??= region;
  }
  if (colloquial) return { match: "colloquial", label: regionName(colloquial) };
  return unclear ? { match: "unclear", label: regionName(unclear) } : { match: "outside" };
}

/** True when an ambiguous place name the rules could not settle ("Georgia") may mean `country`. */
export function ambiguousNameMayBe(name: string, country: CountryCode): boolean {
  const ref = lookupPlace(name);
  return ref?.type === "ambiguous" && ref.candidates.includes(country);
}

export type ZoneFit = "inside" | "edge" | "outside" | "unknown";

function gap(a: UtcOffsetRange, b: UtcOffsetRange): number {
  if (a.maxOffset < b.minOffset) return b.minOffset - a.maxOffset;
  if (b.maxOffset < a.minOffset) return a.minOffset - b.maxOffset;
  return 0;
}

/**
 * How a time-zone constraint fits a country.
 * - `within`: bands named after places ("European time zones") fit when a named place contains the
 *   country at any confidence; offset bands use `bandContainsCountry` (in only part of the year or
 *   in some zones: edge).
 * - `overlap`: hours apart d (closest offsets, standard or daylight) against the overlap needed
 *   (a number, 8 for "full", 2 when unstated): outside when d > 12 - needed (no workable shifted
 *   day), edge when d > 8 - needed, otherwise inside.
 */
export function timezoneFit(tz: TimezoneConstraint, country: CountryCode, _now: Date): ZoneFit {
  if (tz.mode === "within") {
    if (tz.ranges.length === 0) return "unknown";
    let edge = false;
    let unknown = false;
    for (const band of tz.ranges) {
      const fit = bandContainsCountry(band, country);
      if (!fit) unknown = true;
      else if (fit.contains) return "inside";
      else if (fit.confidence !== "certain") edge = true;
    }
    if (edge) return "edge";
    if (unknown) return "unknown";
    // A band named after places ("European time zones") is approximate: offsets within 2 hours of
    // it are the edge, not outside. Offsets decide, never the place names, so countries with the
    // same clock get the same fit.
    if (tz.places) {
      const offsets = COUNTRY_OFFSETS.get(country);
      if (offsets) {
        const own = offsets.daylight ? [offsets.standard, offsets.daylight] : [offsets.standard];
        const d = Math.min(...own.flatMap((o) => tz.ranges.map((band) => gap(o, band))));
        if (d <= 2) return "edge";
      }
    }
    return "outside";
  }
  const offsets = COUNTRY_OFFSETS.get(country);
  if (!offsets || tz.ranges.length === 0) return "unknown";
  const own = offsets.daylight ? [offsets.standard, offsets.daylight] : [offsets.standard];
  const d = Math.min(...own.flatMap((o) => tz.ranges.map((band) => gap(o, band))));
  const needed = tz.overlapHours === "full" ? 8 : (tz.overlapHours ?? 2);
  if (d > 12 - needed) return "outside";
  if (d > 8 - needed) return "edge";
  return "inside";
}

/** Human names for a scope, for reason text: "United States, Canada and 3 more". */
export function placeNames(scopes: SignalScopes, max = 3): string {
  const names = [
    ...scopes.countries.map((c) => countryName(c) ?? c),
    ...scopes.regions.map((r) => regionInfo(r).name),
  ];
  if (names.length <= max) return joinNames(names);
  return `${names.slice(0, max).join(", ")} and ${names.length - max} more`;
}

function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export function regionName(region: RegionCode): string {
  return regionInfo(region).name;
}
