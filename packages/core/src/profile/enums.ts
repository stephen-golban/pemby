// Core <-> database spelling for ways of working, seniority and English level (phase 06 contract,
// "Enums"). Core spelling (`WAYS_OF_WORKING`, `SENIORITIES`) is canonical in TypeScript; the
// database uses underscores and has no `staff`. Nothing else converts by hand. `@pemby/db` imports
// the DB_* lists below for its pg enums, so the two cannot drift. Isomorphic.

import type { Seniority, WayOfWorking } from "../ways-of-working";

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

/** `seniority` pg enum values (PLAN D10). Core's `staff` has no database value. */
export const DB_SENIORITIES = [
  "intern",
  "junior",
  "middle",
  "senior",
  "lead",
  "principal",
] as const;
export type DbSeniority = (typeof DB_SENIORITIES)[number];

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

const SENIORITY_TO_DB = {
  intern: "intern",
  junior: "junior",
  middle: "middle",
  senior: "senior",
  lead: "lead",
  staff: "lead",
  principal: "principal",
} as const satisfies Record<Seniority, DbSeniority>;

export function toDbWay(way: WayOfWorking): DbWayOfWorking {
  return WAY_TO_DB[way];
}

export function fromDbWay(way: DbWayOfWorking): WayOfWorking {
  return WAY_FROM_DB[way];
}

/** `staff` is stored as `lead`; the round trip is lossy for `staff` only. */
export function toDbSeniority(seniority: Seniority): DbSeniority {
  return SENIORITY_TO_DB[seniority];
}

export function fromDbSeniority(seniority: DbSeniority): Seniority {
  return seniority;
}
