// Region memberships that change on a known date. Isomorphic.

import type { CountryCode } from "./countries";
import type { RegionCode, RegionMembership } from "./groups";

/**
 * Region memberships that change on a known date. `regionContains` describes today; the engine
 * applies these when `now` is on or after `from`.
 */
export const DATED_MEMBERSHIPS: ReadonlyArray<{
  region: RegionCode;
  country: CountryCode;
  from: Date;
  membership: RegionMembership;
}> = [
  // Moldova's CIS withdrawal takes effect 2027-04-08 (see groups.ts, [CIS]).
  {
    region: "CIS",
    country: "MD",
    from: new Date("2027-04-08T00:00:00Z"),
    membership: { contains: false, confidence: "certain" },
  },
];
