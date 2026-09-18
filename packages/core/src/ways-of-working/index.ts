// Ways of working and seniority (PLAN D3, D10). Types only.

export const WAYS_OF_WORKING = [
  "b2b-contractor",
  "eor-employee",
  "relocation-visa",
  "freelance",
  "local",
  "paid-program",
] as const;
export type WayOfWorking = (typeof WAYS_OF_WORKING)[number];

export const EMPLOYMENT_TYPES = ["full-time", "part-time", "contract-to-hire"] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

/**
 * The seniority ladder, ordered from least to most senior. Gates compare by index (PLAN D6:
 * "seniority within one level"), and the score's `seniority-step-up` gap reads the same order.
 *
 * **This array is the only ladder there is.** `DB_SENIORITIES` in `../profile/enums` *is* this
 * array, not a copy of it, and `packages/db` builds the `seniority` pg enum straight from that —
 * so a rung added here is a rung the database must gain in the same breath, and there is no second
 * list to fall out of step with. It used to carry a seventh value, `staff`, that the pg enum never
 * had: `fromDbSeniority` could not produce it, so no row could ever hold it, and it sat as a
 * phantom rung between `lead` and `principal` that made those two adjacent levels read as two
 * apart. Both directions then failed the gate for a level distance the data cannot express.
 *
 * A CV that says "staff engineer" is mapped onto this ladder upstream (the enrichment and CV
 * schemas already offer only these six), the same way every other free-text title is.
 */
export const SENIORITIES = ["intern", "junior", "middle", "senior", "lead", "principal"] as const;
export type Seniority = (typeof SENIORITIES)[number];
