// Rule tables for the role filter (PLAN D10). Plain, public data: which job titles are in scope.
// Patterns run on normalized text (lowercase ASCII words separated by single spaces, see
// normalize.ts), so they are written with spaces and no punctuation.

import type { RoleFamily } from "./families";

export interface RoleRule {
  /** Stable id, reported in RoleFilterResult.rule. */
  id: string;
  pattern: RegExp;
}

export interface KeepRule extends RoleRule {
  family: RoleFamily;
}

/**
 * Tier 0: titles outside software even when they say "engineer" or "design engineer".
 * Skipped when the same text also says software, firmware, developer or programmer.
 */
export const HARD_EXCLUDE_RULES: readonly RoleRule[] = [
  {
    id: "hardware-engineering",
    pattern:
      /\b(mechanical|electrical|electronics?|civil|structural|chemical|industrial|manufacturing|process|mechatronics|aerospace|automotive hardware|hardware|asic|fpga|pcb|analog|rf|silicon design|optical|thermal|packaging|materials|mining|petroleum|biomedical|hvac|facilities|plumbing|construction|environmental|nuclear|geotechnical|project|commissioning|instrumentation|controls|maintenance|piping|welding|hydraulic|power systems|substation|reliability centered) (design )?engineers?\b|\bindustrial design\b/,
  },
  {
    id: "field-service",
    pattern:
      /\bfield service\b|^field engineers?$|\bservice technician\b|\bmaintenance technician\b/,
  },
  { id: "quality-manufacturing", pattern: /^quality engineer\b|\bsupplier quality\b/ },
  {
    id: "physical-security",
    pattern:
      /(?<!(information|cyber|it|data) )\bsecurity (guard|officer|screener|patrol|supervisor)\b|\b(physical|industrial|personnel) security\b|\bsecurities\b/,
  },
  { id: "data-entry", pattern: /\bdata entry\b/ },
  { id: "audit", pattern: /\b(internal )?audit(or|ors)?\b/ },
];

export const HARD_EXCLUDE_OVERRIDE = /\b(software|firmware|developer|programmer)\b/;

/**
 * Tier 1: unambiguous in-scope roles, most specific family first. A title that matches here is
 * kept even when a tier 2 word appears too ("marketing data analyst", "sales engineer").
 */
export const KEEP_RULES: readonly KeepRule[] = [
  {
    id: "technical-writing",
    family: "technical-writing",
    pattern:
      /\btechnical (writer|author|editor|documentation)s?\b|\bdocumentation (engineer|writer|specialist|lead|manager)\b|\bdocs engineer\b|\bapi (writer|documentation)\b|\binformation developer\b/,
  },
  {
    id: "devrel",
    family: "devrel",
    pattern:
      /\bdeveloper (advocate|advocacy|relations|evangelist)s?\b|\bdevrel\b|\bdevelopers? community\b|\bcommunity engineer\b|\btechnical evangelist\b/,
  },
  {
    id: "engineering-management",
    family: "engineering-management",
    pattern:
      /\b(engineering|engineer|software development|devops|sre|infrastructure) managers?\b|\bmanager (of )?(\w+ )?engineering\b|\btlm\b|\b(director|head|vp|vice president|svp|evp) (of )?(software |platform |infrastructure )?engineering\b|\bengineering (director|head|lead|vp|vice president)\b|\bchief technology officer\b|^cto\b|\btech(nical)? leads?\b|\bengineering team lead\b/,
  },
  {
    id: "security",
    family: "security",
    pattern:
      /\bsecurity (software )?(engineer|engineering|analyst|architect|researcher|specialist|consultant|operations|assurance engineer|lead|manager)s?\b|\b(information|cyber|cloud|application|app|product|infrastructure|network|offensive|defensive|identity|endpoint|platform|data|corporate|enterprise|detection|mobile|web|container|kubernetes) security\b|\bsecurity (compliance|risk|governance|grc) (engineer|analyst|architect)s?\b|\bgrc engineers?\b|\bcybersecurity\b|\b(appsec|infosec|devsecops|secops)\b|\bpen(etration)? test(er|ing)\b|\b(red|blue|purple) team\b|\bsoc (analyst|engineer)\b|\bthreat (intelligence|hunter|hunting|detection|researcher)\b|\bdetection (and response )?engineer\b|\bvulnerability (researcher|engineer|management|analyst)\b|\bincident response\b|\bmalware\b|\breverse engineer\b|\bciso\b/,
  },
  {
    id: "ml-ai",
    family: "ml-ai",
    pattern:
      /\bmachine learning\b|\bml (engineer|scientist|researcher|developer|infrastructure|platform|ops)s?\b|\bmlops\b|\b(ai|genai|llm|nlp) (engineer|researcher|scientist|developer|specialist)s?\b|\bapplied (ai|ml)\b|\bai ml\b|\bdeep learning\b|\bcomputer vision\b|\bnatural language processing\b|^(ai |ml )?research (engineer|scientist)s?\b|\bapplied scientist\b|\bprompt engineer\b|\bai (software )?engineer\b/,
  },
  {
    id: "data-engineering",
    family: "data-engineering",
    pattern:
      /\bdata (engineer|engineering|platform engineer|infrastructure engineer|warehouse|warehousing|pipeline engineer|architect)s?\b|\banalytics engineer(s|ing)?\b|\betl (engineer|developer)s?\b|\bbig data\b|\b(bi|business intelligence) (engineer|developer)s?\b|\bdatabase (engineer|developer)s?\b/,
  },
  {
    id: "data-analytics-science",
    family: "data-analytics-science",
    pattern:
      /\bdata scien(ce|tist|tists)\b|\bdata analy(st|sts|tics)\b|\b(product|bi|business intelligence|reporting|insights) analysts?\b|\b(advanced|product) analy(st|sts|tics)\b|\bbusiness intelligence\b|\bstatisticians?\b|\bdecision scientists?\b|\bquantitative researcher\b/,
  },
  {
    id: "qa-sdet",
    family: "qa-sdet",
    pattern:
      /\bqa (engineer|analyst|tester|automation|lead|manager|specialist)s?\b|\bquality assurance (engineer|analyst|tester|automation|lead)s?\b|\bsdet\b|\bsoftware (development )?engineers? in test\b|\btest (automation |software )?(engineer|analyst|developer|lead)s?\b|\b(automation|software|manual|game) testers?\b|^testers?\b|\bsoftware quality (engineer|assurance)\b/,
  },
  {
    id: "mobile",
    family: "mobile",
    pattern:
      /\bmobile (software )?(engineer|developer|application developer|app developer)s?\b|\b(ios|android|react native|flutter|swift|swiftui)\b/,
  },
  {
    id: "full-stack",
    family: "full-stack",
    pattern: /\bfull ?stack\b/,
  },
  {
    id: "frontend",
    family: "frontend",
    pattern:
      /\bfront ?end\b|\b(ui|web|web ui|web application|javascript|typescript|react|angular|vue|svelte) (software )?(engineer|developer)s?\b|\bdesign engineers?\b|\bux engineers?\b/,
  },
  {
    id: "backend",
    family: "backend",
    pattern:
      /\bback ?end\b|\bserver side\b|\bapi (engineer|developer)s?\b|\b(java|golang|go|python|ruby|rails|ruby on rails|php|nodejs|node|dotnet|csharp|scala|elixir|erlang|django|laravel|spring) (software )?(engineer|developer)s?\b/,
  },
  {
    id: "devops-sre-platform",
    family: "devops-sre-platform",
    pattern:
      /\bdevops\b|\bsite reliability\b|\bsre\b|(?<!business )\b(platform|infrastructure|cloud|cloud infrastructure|production|reliability|build|release|network|networking|systems?|observability|kubernetes|operations|storage|linux systems?|deployment|ci cd|automation) engineers?\b|\b(cloud|infrastructure|platform) architects?\b|\bplatform engineering\b|\bincident management engineer\b/,
  },
  {
    id: "it-support-sysadmin",
    family: "it-support-sysadmin",
    pattern:
      /\bit (site )?(support|specialist|technician|engineer|administrator|operations|manager|analyst|helpdesk|help desk|service desk|systems|infrastructure)\b|\bhelp ?desk\b|\bservice desk\b|\bdesktop support\b|\bsystems? administrators?\b|\bsysadmins?\b|\b(linux|windows|network|database|cloud|m365|office 365) administrators?\b|\bdba\b|\bsupport engineers?\b|\bend user (computing|support)\b/,
  },
  {
    id: "solutions-architecture",
    family: "solutions-architecture",
    pattern:
      /\bsolutions? (architect|architects|architecture|engineer|engineers|engineering)\b|\b(pre ?sales|sales) engineers?\b|\bcustomer engineers?\b|\bfield engineer(s|ing)?\b|\bprofessional services (engineer|technical architect|architect)s?\b|\b(technical|enterprise|integration) architects?\b|\bimplementation engineers?\b|\bforward deployed (infrastructure )?engineers?\b/,
  },
  {
    id: "software-engineering",
    family: "software-engineering",
    pattern:
      /\bsoftware (engineer|engineers|engineering|developer|developers|development engineer)\b|\bswe\b|\bprogrammers?\b|\b(firmware|embedded|embedded software|kernel|linux kernel|compiler|systems software|game|gameplay|graphics|blockchain|smart contract|rust|cpp|c|golang|salesforce|sfdc|servicenow|sap|abap|workday|netsuite|dynamics|integration|application|applications|product) (engineer|developer)s?\b|\bforward deployed software engineer\b|\bsoftware architects?\b|\bsystems? software engineers?\b|\bbusiness systems engineers?\b/,
  },
];

/**
 * Refinement hints: when a title only reached the software-engineering catch-all
 * ("Software Engineer, Data Platform"), these look at the rest of the title and the department.
 */
export const REFINE_RULES: readonly KeepRule[] = [
  { id: "refine-security", family: "security", pattern: /\bsecurity\b|\bvulnerabilit(y|ies)\b/ },
  {
    id: "refine-ml-ai",
    family: "ml-ai",
    pattern: /\b(machine learning|ml|ai|nlp|llm|genai|computer vision)\b/,
  },
  {
    id: "refine-data-engineering",
    family: "data-engineering",
    pattern: /\bdata (platform|infrastructure|engineering|pipelines?|warehouse)\b/,
  },
  { id: "refine-mobile", family: "mobile", pattern: /\b(mobile|ios|android)\b/ },
  { id: "refine-full-stack", family: "full-stack", pattern: /\bfull ?stack\b/ },
  {
    id: "refine-frontend",
    family: "frontend",
    pattern: /\bfront ?end\b|\b(react|vue|angular|typescript)\b/,
  },
  {
    id: "refine-backend",
    family: "backend",
    pattern: /\bback ?end\b|\b(golang|ruby|rails|java|php|nodejs)\b/,
  },
  {
    id: "refine-devops",
    family: "devops-sre-platform",
    pattern: /\b(infrastructure|reliability|devops|sre|kubernetes|cloud)\b/,
  },
];

/**
 * Tier 2: out-of-scope roles (PLAN D10 leaves them for later or never). Checked after tier 1, so
 * "security engineer, product" survives while "product manager, security" does not.
 */
export const EXCLUDE_RULES: readonly RoleRule[] = [
  {
    id: "sales",
    pattern:
      /\bsales\b|\bsales enablement\b|\baccount (executive|manager|director|management|representative|lead)s?\b|\b(bdr|sdr|bdrs|sdrs)\b|\bbusiness development\b|\bdevelopment representatives?\b|\brenewals?\b|\bdeal (desk|strategist|pricing)\b|\binside sales\b|\bhunter\b|\bgrower\b|\bcommercial (lead|director|manager)\b|\bfield cto\b|\bsolutions consultant\b|\bimplementation consultant\b|\bengagement manager\b/,
  },
  {
    id: "customer-success-support",
    pattern:
      /\bcustomer (success|service|support|experience|care|activation|operations)\b|\bsupport (specialist|associate|agent|representative|operations)\b|\bpremium support\b|\bsoutien\b|\bsupport premium\b|\bclient services\b|\bcall center\b/,
  },
  {
    id: "marketing",
    pattern:
      /\bmarketing\b|\bpmm\b|\bseo\b|\baeo\b|\bsem\b|\bpaid (media|digital|social)\b|\bgrowth marketer\b|\bbrand\b|\bcampaigns?\b|\bsocial media\b|\bpublic relations\b|\bcommunications?\b|\bcontent (marketing|strategist|writer|lead|manager|operations)\b|\bcopywriter\b|\bevents?\b/,
  },
  {
    id: "product-management",
    pattern:
      /\bproduct (manager|managers|management|owner|owners|lead|director|operations|specialist)\b|\b(director|head|vp|vice president) of product\b|\bplatform managers?\b/,
  },
  {
    id: "program-project-management",
    pattern:
      /\b(program|programme|project|delivery|release train) managers?\b|\bprograms? (lead|manager|management|coordinator)\b|\bproject (lead|coordinator|management)\b|\bscrum master\b|\bagile coach\b|\bpmo\b/,
  },
  {
    id: "design",
    pattern:
      /\bdesigners?\b|\bproduct design\b|\bdesign (manager|lead|director|operations)\b|\b(ux|user) research(er|ers)?\b|\bcreative director\b|\bart director\b|\billustrator\b|\bvideo editor\b|\beditor\b|\banimator\b|\bphotographer\b/,
  },
  {
    id: "talent-hr",
    pattern:
      /\brecruit(er|ers|ing|ment)\b|\btalent\b|\bsourcer\b|\bhuman resources\b|\bhr\b|\bhrbp\b|\bpeople (partner|consultant|operations|business partner|team|project)\b|\bbenefits\b|\bpayroll\b|\bcompensation\b|\btotal rewards\b|\blearning and development\b|\bexecutive search\b|\bworkday analyst\b/,
  },
  {
    id: "legal-compliance",
    pattern:
      /\bcounsel\b|\blegal\b|\bparalegal\b|\battorney\b|\blawyer\b|\bcompliance\b|\bregulatory\b|\bprivacy (operations|counsel|program)\b|\bsanctions\b|\baml\b|\bkyc\b|\bmoney laundering\b|\bpolicy manager\b/,
  },
  {
    id: "finance",
    pattern:
      /\bfinanc(e|ial)\b|\baccount(ant|ants|ing)\b|\baccounts (payable|receivable)\b|\bcontroller\b|\btax\b|\btreasury\b|\bfp a\b|\binvestments?\b|\bcapital markets\b|\bunderwriter\b|\bcredit risk\b|\breconciliation\b|\bbilling specialist\b|\bprocurement\b|\bstrategic sourcing\b/,
  },
  {
    id: "risk-fraud-operations",
    pattern:
      /\bfraud\b|\brisk (operations|analyst|manager|partnerships)\b|\binvestigator\b|\btrust and safety (specialist|agent|associate)\b|\boperations\b|\bops (manager|associate|specialist)\b|\bstrategist\b|\bstrategy\b|\bbusiness (analyst|partner|systems analyst|operations)\b|\bmarket (manager|associate)\b|\bquality (associate|analyst|specialist|manager)\b|\bmanager quality\b/,
  },
  {
    id: "partnerships",
    pattern:
      /\bpartner(s|ship|ships)?\b|\balliances?\b|\bchannel\b|\becosystem (manager|development|sales)\b/,
  },
  {
    id: "admin-executive",
    pattern:
      /\b(executive|administrative|personal) assistants?\b|\badministrative\b|\boffice (manager|coordinator)\b|\breceptionist\b|\bchiefofstaff\b|\bchief (executive|operating|financial|marketing|revenue|people|commercial) officer\b|\b(ceo|coo|cfo|cmo|cro)\b|\bgeneral manager\b|\barea vice president\b|\bworkplace\b|\bfacilities\b|\btravel\b/,
  },
  {
    id: "non-software-engineering",
    pattern:
      /\bcustomer success (engineer|architect)s?\b|\bdeployment strategist\b|\btechnical account manager\b/,
  },
];

/** Tier 3: a generic engineer or developer title with nothing more specific. */
export const GENERIC_ENGINEER = /\b(engineer|engineers|developer|developers|programmer|coder)\b/;

/**
 * Departments that turn a generic "Engineer" title out of scope. Narrower than EXCLUDE_RULES on
 * purpose: engineering teams are often named after the business area they serve
 * ("Accounting Products", "Risk Engineering").
 */
export const NON_TECH_DEPARTMENT_RULES: readonly RoleRule[] = [
  {
    id: "sales",
    pattern: /\bsales\b|\baccount (executives?|management)\b|\bbusiness development\b/,
  },
  {
    id: "customer-success-support",
    pattern: /\bcustomer (success|service|support|experience|care)\b/,
  },
  { id: "marketing", pattern: /\bmarketing\b/ },
  { id: "talent-hr", pattern: /\brecruit(ing|ment)\b|\btalent acquisition\b|\bhuman resources\b/ },
  { id: "legal", pattern: /\blegal\b/ },
  {
    id: "hardware-manufacturing",
    pattern:
      /\b(manufacturing|mechanical|electrical|facilities|construction|maintenance|field service)\b/,
  },
];
