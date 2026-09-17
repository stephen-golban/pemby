// Default ways of working for a new profile, from seniority (PLAN D3, D11). Isomorphic.

import type { Seniority, WayOfWorking } from "../ways-of-working";

const BASE_WAYS = ["b2b-contractor", "eor-employee"] as const satisfies readonly WayOfWorking[];
const EARLY_CAREER_WAYS = [
  ...BASE_WAYS,
  "local",
  "paid-program",
] as const satisfies readonly WayOfWorking[];

/**
 * Middle and up: B2B contractor and EOR employee. Intern and junior also get local and paid
 * programs. Unknown seniority (`null`) gets the middle-and-up set. Returns a fresh array.
 */
export function defaultWaysFor(seniority: Seniority | null): WayOfWorking[] {
  return seniority === "intern" || seniority === "junior" ? [...EARLY_CAREER_WAYS] : [...BASE_WAYS];
}
