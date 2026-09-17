import { classifyRole, type RoleFamily } from "@pemby/core";

// Role gate for the phase 06 teaser. `packages/core/src/roles` classifies titles but has no notion
// of which families are close enough to show one person; this private table is that notion until
// the phase 07 matcher owns it (suggested home: packages/core/src/roles).

/** Job families shown to someone whose own title is in the key family (always includes itself). */
const COMPATIBLE: Readonly<Record<RoleFamily, readonly RoleFamily[]>> = {
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

/**
 * Job role families compatible with the person's titles, or null when the role gate is skipped:
 * no titles, or no title classifies into a D10 family (for example "Co-founder"), where a hard
 * gate would hide everything on the strength of a title we cannot read.
 */
export function compatibleFamilies(titles: readonly string[]): RoleFamily[] | null {
  const own = new Set<RoleFamily>();
  for (const title of titles) {
    const { family } = classifyRole({ title });
    if (family) own.add(family);
  }
  if (own.size === 0) return null;
  const out = new Set<RoleFamily>();
  for (const family of own) {
    out.add(family);
    for (const other of COMPATIBLE[family]) out.add(other);
  }
  return [...out];
}
