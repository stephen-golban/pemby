// Which role families are close enough to show one person (PLAN D10). `classifyRole` reads a title;
// this says which families a person with that title should also see. Used as a SQL pre-filter
// before scoring, not as a hard gate: `match_gate` has no role value and PLAN D6 lists none.
//
// Moved here from `apps/web/lib/teaser/roles.ts` (phase 06), which said this was its home.

import type { RoleFamily } from "./families";

/** Job families shown to someone whose own title is in the key family (always includes itself). */
export const COMPATIBLE_FAMILIES: Readonly<Record<RoleFamily, readonly RoleFamily[]>> = {
  frontend: ["full-stack", "software-engineering"],
  backend: ["full-stack", "software-engineering"],
  "full-stack": ["frontend", "backend", "software-engineering"],
  mobile: ["software-engineering"],
  "devops-sre-platform": ["software-engineering"],
  "data-engineering": ["backend", "software-engineering"],
  "ml-ai": ["data-analytics-science", "software-engineering"],
  "qa-sdet": [],
  security: [],
  "software-engineering": ["frontend", "backend", "full-stack"],
  "data-analytics-science": ["ml-ai", "data-engineering"],
  "it-support-sysadmin": ["devops-sre-platform"],
  "solutions-architecture": [],
  "engineering-management": [],
  devrel: [],
  "technical-writing": [],
};

/** True when a job in `jobFamily` should be shown to someone whose own family is `ownFamily`. */
export function isCompatibleFamily(ownFamily: RoleFamily, jobFamily: RoleFamily): boolean {
  return ownFamily === jobFamily || COMPATIBLE_FAMILIES[ownFamily].includes(jobFamily);
}
