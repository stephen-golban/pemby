// Role filter (PLAN D10). A cheap, deterministic rules pass that runs on every ingested job
// before any AI enrichment and keeps only in-scope roles. Isomorphic: no Node imports.
//
// Decision order, applied to the role head of the title first and to the whole title only when
// the head decides nothing:
//   0. hard excludes: hardware and other non-software "engineers", physical security, data entry
//   1. keep rules: unambiguous in-scope roles, most specific family first
//   2. exclude rules: sales, marketing, product, design, talent acquisition, HR, finance, operations and so on
//   3. generic engineer or developer: kept as software-engineering unless the department is
//      out of scope
// A software-engineering result is refined from the rest of the title and the department
// ("Software Engineer, Data Platform" becomes data-engineering).
//
// Judgment calls (PLAN D10 does not spell these out):
// - software-engineering is the catch-all family for generic software titles.
// - Solutions engineers, sales engineers, pre-sales engineers, customer engineers, field
//   engineers and forward deployed engineers are solutions-architecture: technical,
//   customer-facing roles that engineers move into. Solutions consultants, technical account
//   managers, customer success engineers and deployment strategists are dropped.
// - Network, systems and operations engineers are devops-sre-platform; network, system and
//   database administrators are it-support-sysadmin.
// - Technical support engineers are it-support-sysadmin; customer support specialists and
//   agents are dropped.
// - Technical program managers are dropped with other program and project managers.
// - Business application developers (Salesforce, SAP, ServiceNow) are kept; administrators of
//   those tools are dropped.
// - Research engineers and scientists count as ml-ai only when the title starts with them.
// - Field engineers need a qualifier ("Cloud Field Engineer"); a bare "Field Engineer" is
//   usually industrial and is dropped.
// - A bare "Engineer" or "Developer" title is kept as software-engineering unless the department
//   is sales, customer success, marketing, talent acquisition, legal or hardware.

import { ROLE_FAMILIES, type RoleFamily } from "./families";
import { normalizeTitle, normalizeText } from "./normalize";
import {
  EXCLUDE_RULES,
  GENERIC_ENGINEER,
  HARD_EXCLUDE_OVERRIDE,
  HARD_EXCLUDE_RULES,
  KEEP_RULES,
  NON_TECH_DEPARTMENT_RULES,
  REFINE_RULES,
} from "./rules";

export { ROLE_FAMILIES, type RoleFamily };

export interface RoleFilterInput {
  title: string;
  department?: string | null;
}

export interface RoleFilterResult {
  keep: boolean;
  family: RoleFamily | null;
  /** Stable id of the rule that decided, for debugging ("keep:backend", "exclude:sales"). */
  rule: string;
}

type Decision = RoleFilterResult | null;

function drop(rule: string): RoleFilterResult {
  return { keep: false, family: null, rule };
}

function decide(text: string, department: string): Decision {
  if (text.length === 0) return null;

  if (!HARD_EXCLUDE_OVERRIDE.test(text)) {
    for (const r of HARD_EXCLUDE_RULES)
      if (r.pattern.test(text)) return drop(`hard-exclude:${r.id}`);
  }
  for (const r of KEEP_RULES) {
    if (r.pattern.test(text)) return { keep: true, family: r.family, rule: `keep:${r.id}` };
  }
  for (const r of EXCLUDE_RULES) if (r.pattern.test(text)) return drop(`exclude:${r.id}`);

  if (GENERIC_ENGINEER.test(text)) {
    for (const r of NON_TECH_DEPARTMENT_RULES) {
      if (r.pattern.test(department)) return drop(`generic-engineer:department-${r.id}`);
    }
    return { keep: true, family: "software-engineering", rule: "generic-engineer" };
  }
  return null;
}

/** Classifies a job title (and optional department) into a D10 role family, or drops it. */
export function classifyRole(input: RoleFilterInput): RoleFilterResult {
  const { primary, full } = normalizeTitle(input.title);
  const department = normalizeText(input.department ?? "");

  const result =
    decide(primary, department) ?? (full !== primary ? decide(full, department) : null);
  if (!result) return drop(input.title.trim().length === 0 ? "empty-title" : "no-match");

  if (result.family === "software-engineering") {
    const rest = `${full} ${department}`;
    for (const r of REFINE_RULES) {
      if (r.pattern.test(rest))
        return { keep: true, family: r.family, rule: `${result.rule}>${r.id}` };
    }
  }
  return result;
}
