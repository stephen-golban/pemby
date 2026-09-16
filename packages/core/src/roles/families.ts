// Role families in scope (PLAN D10). One value per family named there, plus
// "software-engineering" as the catch-all for generic software titles ("Software Engineer",
// "Staff Engineer, Payments") that do not name a narrower family.

export const ROLE_FAMILIES = [
  // Engineering
  "frontend",
  "backend",
  "full-stack",
  "mobile",
  "devops-sre-platform",
  "data-engineering",
  "ml-ai",
  "qa-sdet",
  "security",
  "software-engineering",
  // Adjacent
  "data-analytics-science",
  "it-support-sysadmin",
  "solutions-architecture",
  "engineering-management",
  "devrel",
  "technical-writing",
] as const;
export type RoleFamily = (typeof ROLE_FAMILIES)[number];
