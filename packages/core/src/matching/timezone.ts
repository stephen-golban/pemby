// Time-zone overlap, used by the score (never as a hard gate: PLAN D6 lists no time-zone gate and
// the `match_gate` pg enum has no value for one). Pure and isomorphic: no IANA database, no Intl.

import { COUNTRY_OFFSETS } from "../eligibility/regions";
import type { MatchJob, MatchUser } from "./types";

/**
 * Hours in the working day both sides are assumed to keep. A convention, stated once so no call
 * site invents its own; it is what turns an offset gap into "about Nh overlap".
 */
export const WORKDAY_HOURS = 8;

/** Overlap the score treats as full marks when neither the post nor the user states one. */
export const DEFAULT_REQUIRED_OVERLAP_HOURS = 4;

/**
 * Whole hours from UTC for a country, from the standard-time offsets already in
 * `eligibility/regions`. Multi-zone countries return the middle of their range. Null when the
 * country has no offset data.
 */
export function utcOffsetForCountry(country: string): number | null {
  const offsets = COUNTRY_OFFSETS.get(country.toUpperCase());
  if (!offsets) return null;
  const { minOffset, maxOffset } = offsets.standard;
  return (minOffset + maxOffset) / 2;
}

/** The user's offset: their own, else their country's, else null. */
export function userUtcOffset(user: MatchUser): number | null {
  if (user.utcOffsetHours !== null) return user.utcOffsetHours;
  return user.residenceCountry ? utcOffsetForCountry(user.residenceCountry) : null;
}

export interface TimezoneOverlap {
  /**
   * Whole-ish hours of overlap between two `WORKDAY_HOURS` days, or **null when the post states no
   * time-zone band at all**. Null is "the post does not say", which is not the same number as "a
   * whole working day of overlap": see the note on `timezoneOverlap`.
   */
  hours: number | null;
  /** Hours the post (or the user) asks for. */
  requiredHours: number;
  /** Null when the post sets no time-zone requirement at all. */
  gapHours: number | null;
}

/**
 * Overlap between the user's assumed working day and the band the post asks for.
 *
 * A post with no band **constrains nothing, and that is not evidence of fit**. It reports
 * `hours: null` (alongside `gapHours: null`), and the score leaves the component unscored rather
 * than awarding it a full working day — an unstated requirement is the absence of information, and
 * scoring it as a perfect overlap is how a post that says nothing about itself used to outrank one
 * that says a great deal.
 *
 * The whole function returns null when the user's offset is unknown and the post does ask for a
 * band, which is "no signal" for a different reason: we cannot place the user, rather than the post
 * not placing itself.
 */
export function timezoneOverlap(user: MatchUser, job: MatchJob): TimezoneOverlap | null {
  const required =
    job.timezone?.overlapHours ?? user.minOverlapHours ?? DEFAULT_REQUIRED_OVERLAP_HOURS;
  const requiredHours = Math.max(1, Math.min(WORKDAY_HOURS, required));

  const window = job.timezone;
  if (!window || (window.minUtcOffset === null && window.maxUtcOffset === null)) {
    return { hours: null, requiredHours, gapHours: null };
  }

  const offset = userUtcOffset(user);
  if (offset === null) return null;

  const min = window.minUtcOffset ?? window.maxUtcOffset ?? 0;
  const max = window.maxUtcOffset ?? window.minUtcOffset ?? 0;
  const low = Math.min(min, max);
  const high = Math.max(min, max);
  const gap = offset < low ? low - offset : offset > high ? offset - high : 0;
  return { hours: Math.max(0, WORKDAY_HOURS - Math.abs(gap)), requiredHours, gapHours: gap };
}
