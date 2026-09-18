// Hard gate names, in core spelling and database spelling (PLAN D6).
//
// The `match_gate` pg enum is the better vocabulary and wins: it separates `salary_missing` (the
// post lists no pay and the user hid those) from `salary` (the post lists pay below the user's
// floor). They are two different near-miss buckets with two different one-tap fixes. `score` is in
// that enum too but is not a gate, so it lives in `../near-miss` as a blocker instead.
//
// Core hyphenates, Postgres underscores. Convert only with the mappers below, in the style of
// `toDbWay` / `fromDbWay` in `../profile/enums`, so the two spellings cannot drift.

/** Every hard gate, in core spelling. Evaluation order is the order of this list. */
export const HARD_GATES = [
  "eligibility",
  "way-of-working",
  "freshness",
  "seniority",
  "dealbreaker",
  "salary",
  "salary-missing",
] as const;
export type HardGate = (typeof HARD_GATES)[number];

/** The same gates as `match_gate` pg enum values (that enum also carries `score`). */
export const DB_HARD_GATES = [
  "eligibility",
  "way_of_working",
  "freshness",
  "seniority",
  "dealbreaker",
  "salary",
  "salary_missing",
] as const;
export type DbHardGate = (typeof DB_HARD_GATES)[number];

const GATE_TO_DB = {
  eligibility: "eligibility",
  "way-of-working": "way_of_working",
  freshness: "freshness",
  seniority: "seniority",
  dealbreaker: "dealbreaker",
  salary: "salary",
  "salary-missing": "salary_missing",
} as const satisfies Record<HardGate, DbHardGate>;

const GATE_FROM_DB = {
  eligibility: "eligibility",
  way_of_working: "way-of-working",
  freshness: "freshness",
  seniority: "seniority",
  dealbreaker: "dealbreaker",
  salary: "salary",
  salary_missing: "salary-missing",
} as const satisfies Record<DbHardGate, HardGate>;

export function toDbGate(gate: HardGate): DbHardGate {
  return GATE_TO_DB[gate];
}

export function fromDbGate(gate: DbHardGate): HardGate {
  return GATE_FROM_DB[gate];
}
