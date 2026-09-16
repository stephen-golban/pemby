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

/** Ordered from least to most senior; gates compare by index. */
export const SENIORITIES = [
  "intern",
  "junior",
  "middle",
  "senior",
  "lead",
  "staff",
  "principal",
] as const;
export type Seniority = (typeof SENIORITIES)[number];
