// Core <-> database spelling for ways of working, seniority and English level (phase 06 contract,
// "Enums"). Core spelling (`WAYS_OF_WORKING`, `SENIORITIES`) is canonical in TypeScript; the
// database uses underscores. Nothing else converts by hand. `@pemby/db` imports the DB_* lists
// below for its pg enums, so the two cannot drift. Isomorphic.

import type { WayOfWorking } from "../ways-of-working";
import { SENIORITIES, type Seniority } from "../ways-of-working";

/** `way_of_working` pg enum values. */
export const DB_WAYS_OF_WORKING = [
  "b2b_contractor",
  "eor_employee",
  "relocation_visa",
  "freelance",
  "local",
  "paid_program",
] as const;
export type DbWayOfWorking = (typeof DB_WAYS_OF_WORKING)[number];

/**
 * `seniority` pg enum values (PLAN D10).
 *
 * **The same array as core's `SENIORITIES`, deliberately, not a copy of it.** Seniority is the one
 * enum whose two spellings are identical, so a second list bought nothing and cost correctness: the
 * copy that used to live here was one value shorter than core's ladder, which left the gate
 * comparing levels by an index the database could not produce. Aliasing removes the possibility
 * rather than checking for it — `packages/db` builds `pgEnum("seniority", DB_SENIORITIES)` from
 * this binding, so adding a rung to the ladder is a schema change drizzle will demand a migration
 * for, and dropping one is a type error at every `satisfies` below.
 */
export const DB_SENIORITIES = SENIORITIES;
export type DbSeniority = Seniority;

/** `english_level` pg enum values: CEFR levels plus native. Same spelling in core and DB. */
export const ENGLISH_LEVELS = ["a1", "a2", "b1", "b2", "c1", "c2", "native"] as const;
export type EnglishLevel = (typeof ENGLISH_LEVELS)[number];

const WAY_TO_DB = {
  "b2b-contractor": "b2b_contractor",
  "eor-employee": "eor_employee",
  "relocation-visa": "relocation_visa",
  freelance: "freelance",
  local: "local",
  "paid-program": "paid_program",
} as const satisfies Record<WayOfWorking, DbWayOfWorking>;

const WAY_FROM_DB = {
  b2b_contractor: "b2b-contractor",
  eor_employee: "eor-employee",
  relocation_visa: "relocation-visa",
  freelance: "freelance",
  local: "local",
  paid_program: "paid-program",
} as const satisfies Record<DbWayOfWorking, WayOfWorking>;

/**
 * Kept as an explicit table rather than collapsed away: it is what fails to compile on the day the
 * two spellings stop being identical, and the call sites below stay honest about crossing a
 * boundary.
 */
const SENIORITY_TO_DB = {
  intern: "intern",
  junior: "junior",
  middle: "middle",
  senior: "senior",
  lead: "lead",
  principal: "principal",
} as const satisfies Record<Seniority, DbSeniority>;

export function toDbWay(way: WayOfWorking): DbWayOfWorking {
  return WAY_TO_DB[way];
}

export function fromDbWay(way: DbWayOfWorking): WayOfWorking {
  return WAY_FROM_DB[way];
}

/** One ladder, one spelling: the round trip is lossless in both directions. */
export function toDbSeniority(seniority: Seniority): DbSeniority {
  return SENIORITY_TO_DB[seniority];
}

export function fromDbSeniority(seniority: DbSeniority): Seniority {
  return seniority;
}
