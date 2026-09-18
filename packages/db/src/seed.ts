// Demo data for staging. Everything here is fictional: companies are labelled "(fictional)",
// people use example.com addresses, and demo rows carry `is_demo` where the table has it.
//
// Idempotent: every row has a deterministic id and is inserted with ON CONFLICT, so running it
// twice leaves the same rows. Time-sensitive columns (job freshness, pass dates) are refreshed.
//
// Usage: RAILWAY_SERVICE=web ./scripts/dev-staging.sh env APP_ENV=staging pnpm --filter @pemby/db seed
import { createHash } from "node:crypto";
import {
  ENGINE_REASONS,
  SCORER_VERSION,
  classifyRole,
  countryName,
  fromDbGate,
  fromDbWay,
} from "@pemby/core";
import type {
  CountryCode,
  EngineReasonKey,
  GateReasonKey,
  GateResult,
  HardGate,
  RoleFamily,
} from "@pemby/core";
import { sql } from "drizzle-orm";
import { createDb } from "./client";
import type { Db } from "./client";
import {
  aiUsage,
  applications,
  channels,
  companies,
  cvFiles,
  deliveryLog,
  eligibilityEvidence,
  flags,
  jobEligibility,
  jobEnrichment,
  jobs,
  kits,
  matches,
  passes,
  payments,
  profiles,
  referrals,
  user,
} from "./schema";

type Tier = "green" | "yellow" | "white" | "red";
type Way =
  "b2b_contractor" | "eor_employee" | "relocation_visa" | "freelance" | "local" | "paid_program";
type Seniority = "intern" | "junior" | "middle" | "senior" | "lead" | "principal";

// Fail closed: only an explicit staging or development environment may receive demo data.
const appEnv = process.env.APP_ENV;
if (appEnv !== "staging" && appEnv !== "development") {
  console.error(
    `Refusing to seed: APP_ENV must be exactly "staging" or "development" (got ${appEnv === undefined ? "unset" : JSON.stringify(appEnv)}).`,
  );
  process.exit(1);
}
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

/** Deterministic UUID (version 8 layout) from a seed key, so re-runs hit the same rows. */
function demoId(key: string): string {
  const h = createHash("sha256").update(`pemby-demo:${key}`).digest("hex");
  const variant = ((parseInt(h.slice(16, 17), 16) & 0x3) | 0x8).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-8${h.slice(13, 16)}-${variant}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const now = new Date();
const ago = (ms: number) => new Date(now.getTime() - ms);
const ahead = (ms: number) => new Date(now.getTime() + ms);
const hash = (s: string) => createHash("sha256").update(s).digest("hex");

// --- Companies -----------------------------------------------------------------------------

const COMPANIES = [
  { slug: "example-co", name: "Example Co (fictional)", hq: "DE" },
  { slug: "northwind-labs", name: "Northwind Labs (fictional)", hq: "NL" },
  { slug: "contoso-cloud", name: "Contoso Cloud (fictional)", hq: "US" },
  { slug: "fabrikam-data", name: "Fabrikam Data (fictional)", hq: "PL" },
  { slug: "tailspin-pay", name: "Tailspin Pay (fictional)", hq: "EE" },
  { slug: "wingtip-health", name: "Wingtip Health (fictional)", hq: "GB" },
  { slug: "lumen-devtools", name: "Lumen Devtools (fictional)", hq: "PT" },
  { slug: "demo-open-source-fund", name: "Demo Open Source Fund (fictional)", hq: "US" },
] as const;

const companyId = (slug: string) => demoId(`company:${slug}`);

// --- Jobs ----------------------------------------------------------------------------------

type JobSeed = {
  key: string;
  company: (typeof COMPANIES)[number]["slug"];
  title: string;
  seniority: Seniority;
  stack: string[];
  ways: Way[];
  /** Tier for Moldova (MD), the launch country. */
  md: Tier;
  /** Tier for Georgia (GE), when the post says something about it. */
  ge?: Tier;
  salary?: [number, number, "hour" | "month" | "year"];
  status?: "open" | "closed" | "quarantined";
  /** Hand-written English, stored in `job_eligibility.reason` as the engine would store it. */
  reason: string;
  /**
   * Closest `ENGINE_REASONS` key to `reason`, so demo rows render through the same i18n path as
   * real ones instead of only as stored English. Some of the fictional prose is a little richer
   * than any one template, so the key is the nearest tier-consistent match, not a translation.
   */
  reasonKey: EngineReasonKey;
  /** Params beyond `country`, which is filled from the scope of the row. */
  reasonParams?: Record<string, string>;
  /** When the Georgia verdict needs a different key from the Moldova one. */
  geReasonKey?: EngineReasonKey;
  geReasonParams?: Record<string, string>;
};

const JOBS: JobSeed[] = [
  {
    key: "j01",
    company: "example-co",
    title: "Senior Backend Engineer (Go)",
    seniority: "senior",
    stack: ["Go", "PostgreSQL", "Kubernetes"],
    ways: ["b2b_contractor"],
    md: "green",
    ge: "green",
    salary: [60000, 80000, "year"],
    reason: "Post lists Moldova among contractor countries",
    reasonKey: "country-named",
  },
  {
    key: "j02",
    company: "example-co",
    title: "Staff Platform Engineer",
    seniority: "lead",
    stack: ["Go", "Terraform", "AWS"],
    ways: ["b2b_contractor", "eor_employee"],
    md: "green",
    ge: "green",
    salary: [85000, 110000, "year"],
    reason: "Hires in Europe via an EOR, including non-EU countries",
    reasonKey: "worldwide-engagement",
    reasonParams: { engagement: "people employed through an EOR" },
  },
  {
    key: "j03",
    company: "example-co",
    title: "Frontend Engineer (React)",
    seniority: "middle",
    stack: ["TypeScript", "React", "Next.js"],
    ways: ["b2b_contractor"],
    md: "yellow",
    ge: "yellow",
    salary: [40000, 55000, "year"],
    reason: "Says 'Europe, remote'; company has hired in non-EU Europe before",
    reasonKey: "region-includes",
    reasonParams: { region: "Europe" },
  },
  {
    key: "j04",
    company: "northwind-labs",
    title: "Full-Stack Engineer (TypeScript)",
    seniority: "senior",
    stack: ["TypeScript", "Node.js", "React", "PostgreSQL"],
    ways: ["eor_employee"],
    md: "green",
    salary: [5000, 6500, "month"],
    reason: "Careers page names Moldova as an EOR country",
    reasonKey: "company-names-country",
  },
  {
    key: "j05",
    company: "northwind-labs",
    title: "Mobile Engineer (React Native)",
    seniority: "middle",
    stack: ["TypeScript", "React Native"],
    ways: ["eor_employee"],
    md: "white",
    ge: "white",
    reason: "Post says 'remote' with no country list",
    reasonKey: "no-signal",
  },
  {
    key: "j06",
    company: "northwind-labs",
    title: "QA Automation Engineer",
    seniority: "middle",
    stack: ["Playwright", "TypeScript"],
    ways: ["b2b_contractor"],
    md: "green",
    salary: [35, 45, "hour"],
    reason: "Post lists Moldova",
    reasonKey: "country-named",
  },
  {
    key: "j07",
    company: "contoso-cloud",
    title: "Site Reliability Engineer",
    seniority: "senior",
    stack: ["Kubernetes", "Terraform", "GCP", "Go"],
    ways: ["b2b_contractor"],
    md: "red",
    ge: "red",
    salary: [120000, 150000, "year"],
    reason: "US persons only (export control)",
    reasonKey: "work-authorization",
    reasonParams: { places: "the United States" },
  },
  {
    key: "j08",
    company: "contoso-cloud",
    title: "Backend Engineer, Billing",
    seniority: "senior",
    stack: ["Java", "Kotlin", "PostgreSQL"],
    ways: ["relocation_visa"],
    md: "green",
    ge: "green",
    salary: [95000, 120000, "year"],
    reason: "Relocation to Dublin with visa sponsorship, any nationality",
    reasonKey: "worldwide-engagement",
    reasonParams: { engagement: "people relocating with visa sponsorship" },
  },
  {
    key: "j09",
    company: "contoso-cloud",
    title: "Developer Advocate",
    seniority: "senior",
    stack: ["TypeScript", "Python"],
    ways: ["eor_employee"],
    md: "yellow",
    reason: "EMEA remote; EOR coverage for Moldova unconfirmed",
    reasonKey: "region-includes",
    reasonParams: { region: "EMEA" },
  },
  {
    key: "j10",
    company: "fabrikam-data",
    title: "Data Engineer",
    seniority: "middle",
    stack: ["Python", "dbt", "Snowflake", "Airflow"],
    ways: ["b2b_contractor"],
    md: "green",
    ge: "green",
    salary: [45000, 60000, "year"],
    reason: "Contractors welcome from Eastern Europe and the Caucasus",
    reasonKey: "country-named",
  },
  {
    key: "j11",
    company: "fabrikam-data",
    title: "Machine Learning Engineer",
    seniority: "senior",
    stack: ["Python", "PyTorch", "Kubernetes"],
    ways: ["b2b_contractor"],
    md: "green",
    ge: "green",
    reason: "Contractors welcome from Eastern Europe and the Caucasus",
    reasonKey: "country-named",
  },
  {
    key: "j12",
    company: "fabrikam-data",
    title: "Data Analyst",
    seniority: "junior",
    stack: ["SQL", "Python", "Looker"],
    ways: ["local"],
    md: "red",
    ge: "red",
    salary: [2500, 3200, "month"],
    reason: "Hybrid in Warsaw, Polish work permit required",
    reasonKey: "onsite-elsewhere",
    reasonParams: { places: "Warsaw" },
  },
  {
    key: "j13",
    company: "tailspin-pay",
    title: "Senior Backend Engineer (Node.js)",
    seniority: "senior",
    stack: ["TypeScript", "Node.js", "PostgreSQL", "Kafka"],
    ways: ["eor_employee", "b2b_contractor"],
    md: "green",
    salary: [70000, 90000, "year"],
    reason: "Hires anywhere in Europe incl. Moldova via EOR",
    reasonKey: "country-named",
  },
  {
    key: "j14",
    company: "tailspin-pay",
    title: "Security Engineer",
    seniority: "senior",
    stack: ["AWS", "Python", "Terraform"],
    ways: ["eor_employee"],
    md: "white",
    reason: "No location detail in post",
    reasonKey: "no-signal",
  },
  {
    key: "j15",
    company: "tailspin-pay",
    title: "Engineering Manager, Payments",
    seniority: "lead",
    stack: ["Go", "PostgreSQL"],
    ways: ["relocation_visa"],
    md: "green",
    ge: "green",
    salary: [110000, 130000, "year"],
    reason: "Relocation to Tallinn, company sponsors permits",
    reasonKey: "worldwide-engagement",
    reasonParams: { engagement: "people relocating on a sponsored permit" },
  },
  {
    key: "j16",
    company: "wingtip-health",
    title: "Frontend Engineer (Vue)",
    seniority: "middle",
    stack: ["TypeScript", "Vue"],
    ways: ["b2b_contractor"],
    md: "yellow",
    ge: "yellow",
    reason: "'Remote within CET ± 2h'; no country list",
    reasonKey: "timezone-includes",
  },
  {
    key: "j17",
    company: "wingtip-health",
    title: "Backend Engineer (Python)",
    seniority: "middle",
    stack: ["Python", "Django", "PostgreSQL"],
    ways: ["eor_employee"],
    md: "red",
    reason: "UK right to work required",
    reasonKey: "work-authorization",
    reasonParams: { places: "the United Kingdom" },
  },
  {
    key: "j18",
    company: "wingtip-health",
    title: "IT Support Engineer",
    seniority: "junior",
    stack: ["Linux", "Jamf", "Google Workspace"],
    ways: ["b2b_contractor"],
    md: "green",
    salary: [18, 24, "hour"],
    reason: "Post lists Moldova and Romania",
    reasonKey: "country-named",
  },
  {
    key: "j19",
    company: "wingtip-health",
    title: "Technical Writer",
    seniority: "middle",
    stack: ["Markdown", "OpenAPI"],
    ways: ["freelance"],
    md: "green",
    ge: "green",
    salary: [30, 40, "hour"],
    reason: "Freelance, worldwide",
    reasonKey: "worldwide-engagement",
    reasonParams: { engagement: "freelancers" },
  },
  {
    key: "j20",
    company: "lumen-devtools",
    title: "Junior Frontend Developer",
    seniority: "junior",
    stack: ["TypeScript", "React", "CSS"],
    ways: ["b2b_contractor"],
    md: "green",
    salary: [20000, 28000, "year"],
    reason: "Post lists Moldova",
    reasonKey: "country-named",
  },
  {
    key: "j21",
    company: "lumen-devtools",
    title: "Rust Engineer, Compiler Tooling",
    seniority: "senior",
    stack: ["Rust", "WebAssembly"],
    ways: ["b2b_contractor"],
    md: "green",
    ge: "green",
    reason: "Worldwide contractors",
    reasonKey: "worldwide-engagement",
    reasonParams: { engagement: "contractors" },
  },
  {
    key: "j22",
    company: "lumen-devtools",
    title: "Solutions Architect",
    seniority: "senior",
    stack: ["AWS", "TypeScript"],
    ways: ["eor_employee"],
    md: "yellow",
    reason: "Europe remote; EOR partner covers most of Europe",
    reasonKey: "region-includes",
    reasonParams: { region: "Europe" },
  },
  {
    key: "j23",
    company: "lumen-devtools",
    title: "DevOps Engineer",
    seniority: "middle",
    stack: ["Docker", "GitHub Actions", "Terraform"],
    ways: ["b2b_contractor"],
    md: "green",
    ge: "green",
    salary: [50000, 65000, "year"],
    reason: "Worldwide contractors",
    reasonKey: "worldwide-engagement",
    reasonParams: { engagement: "contractors" },
    status: "closed",
  },
  {
    key: "j24",
    company: "demo-open-source-fund",
    title: "Paid Open Source Mentorship (Summer)",
    seniority: "intern",
    stack: ["Git", "Python"],
    ways: ["paid_program"],
    md: "green",
    ge: "green",
    salary: [3000, 3000, "month"],
    reason: "Program open to students worldwide",
    reasonKey: "worldwide-engagement",
    reasonParams: { engagement: "students on the program" },
  },
  {
    key: "j25",
    company: "demo-open-source-fund",
    title: "Documentation Internship",
    seniority: "intern",
    stack: ["Markdown"],
    ways: ["paid_program"],
    md: "green",
    ge: "green",
    reason: "Program open worldwide",
    reasonKey: "worldwide-engagement",
    reasonParams: { engagement: "people on the program" },
  },
  {
    key: "j26",
    company: "demo-open-source-fund",
    title: "Graduate Software Engineer",
    seniority: "junior",
    stack: ["C", "Linux"],
    ways: ["eor_employee"],
    md: "green",
    ge: "green",
    reason: "Graduate roles hire home-based worldwide",
    reasonKey: "worldwide-engagement",
    reasonParams: { engagement: "home-based graduates" },
  },
  {
    key: "j27",
    company: "example-co",
    title: "Junior QA Engineer",
    seniority: "junior",
    stack: ["Cypress", "JavaScript"],
    ways: ["local"],
    md: "green",
    salary: [1200, 1600, "month"],
    reason: "Hybrid in Chișinău office",
    reasonKey: "country-named",
  },
  {
    key: "j28",
    company: "northwind-labs",
    title: "Principal Engineer",
    seniority: "principal",
    stack: ["Go", "Distributed systems"],
    ways: ["b2b_contractor"],
    md: "green",
    ge: "green",
    reason: "Worldwide contractors",
    reasonKey: "worldwide-engagement",
    reasonParams: { engagement: "contractors" },
  },
  {
    key: "j29",
    company: "fabrikam-data",
    title: "Remote Data Entry, Pay to Start",
    seniority: "intern",
    stack: [],
    ways: ["freelance"],
    md: "white",
    reason: "Asks candidates to pay a starter fee",
    reasonKey: "no-signal",
    status: "quarantined",
  },
  {
    key: "j30",
    company: "contoso-cloud",
    title: "Frontend Engineer, Design Systems",
    seniority: "senior",
    stack: ["TypeScript", "React", "Storybook"],
    ways: ["b2b_contractor"],
    md: "green",
    ge: "yellow",
    salary: [65000, 85000, "year"],
    reason: "Contractor countries include Moldova; Georgia unclear",
    reasonKey: "country-named",
    geReasonKey: "country-mentioned",
  },
];

const jobId = (key: string) => demoId(`job:${key}`);

/**
 * PLAN D10 family from the same deterministic classifier ingestion runs (`classifyRole`), not from
 * the title text. Three demo posts are deliberately out of scope for it — the two paid programs
 * (PLAN D14) and the "pay to start" scam — and the classifier returns no family for them. They
 * keep `role_family = null`, which is what production holds for a post the role filter dropped;
 * inventing a family for them would make the demo lie about how the filter behaves.
 */
const roleFamilyOf = (j: JobSeed): RoleFamily | null => classifyRole({ title: j.title }).family;

/** The engine version stamped on demo eligibility rows, so they are distinguishable from real ones. */
const DEMO_ENGINE_VERSION = "demo-v1";

/**
 * The reason key and params for one demo eligibility row. `country` is filled from the row's own
 * scope, and only for templates that actually use it, exactly as the engine fills params.
 */
function demoReason(
  j: JobSeed,
  scope: "MD" | "GE",
): { reasonKey: EngineReasonKey; reasonParams: Record<string, string> } {
  const reasonKey = scope === "GE" ? (j.geReasonKey ?? j.reasonKey) : j.reasonKey;
  const extra = scope === "GE" ? (j.geReasonParams ?? j.reasonParams) : j.reasonParams;
  const reasonParams: Record<string, string> = { ...extra };
  if (ENGINE_REASONS[reasonKey].includes("{country}")) {
    reasonParams.country = countryName(scope as CountryCode) ?? scope;
  }
  return { reasonKey, reasonParams };
}

// --- People --------------------------------------------------------------------------------

const USERS = [
  {
    id: "demo_user_ana",
    name: "Ana Demo (fictional)",
    email: "ana.demo@example.com",
    anonymous: false,
  },
  {
    id: "demo_user_ion",
    name: "Ion Demo (fictional)",
    email: "ion.demo@example.com",
    anonymous: false,
  },
  {
    id: "demo_user_nino",
    name: "Nino Demo (fictional)",
    email: "nino.demo@example.com",
    anonymous: false,
  },
  { id: "demo_user_anon", name: "Anonymous", email: "anon-demo@example.com", anonymous: true },
] as const;

async function seed(db: Db) {
  await db.transaction(async (tx) => {
    // Users (Better Auth table). No credential accounts: demo users cannot sign in.
    await tx
      .insert(user)
      .values(
        USERS.map((u) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          emailVerified: !u.anonymous,
          isAnonymous: u.anonymous,
        })),
      )
      .onConflictDoNothing();

    await tx
      .insert(profiles)
      .values([
        {
          id: demoId("profile:ana"),
          userId: "demo_user_ana",
          displayName: "Ana (fictional)",
          citizenships: ["MD", "RO"],
          residenceCountry: "MD",
          timezone: "Europe/Chisinau",
          minOverlapHours: 4,
          hasOwnCompany: true,
          englishLevel: "c1",
          waysOfWorking: ["b2b_contractor", "eor_employee"],
          employmentTypes: ["full_time"],
          titles: ["Backend Engineer", "Full-Stack Engineer"],
          seniority: "senior",
          yearsExperience: 7,
          stack: ["TypeScript", "Node.js", "Go", "PostgreSQL"],
          dealbreakers: ["crypto gambling"],
          minRate: 55000,
          minRateCurrency: "USD",
          minRatePeriod: "year",
          referralCode: "DEMO-ANA",
          onboardingCompletedAt: ago(20 * DAY),
          isDemo: true,
        },
        {
          id: demoId("profile:ion"),
          userId: "demo_user_ion",
          displayName: "Ion (fictional)",
          citizenships: ["MD"],
          residenceCountry: "MD",
          timezone: "Europe/Chisinau",
          minOverlapHours: 6,
          englishLevel: "b2",
          waysOfWorking: ["b2b_contractor", "local", "paid_program"],
          employmentTypes: ["full_time", "part_time"],
          titles: ["Frontend Developer"],
          seniority: "junior",
          yearsExperience: 1,
          stack: ["TypeScript", "React", "CSS"],
          minRate: 1000,
          minRateCurrency: "USD",
          minRatePeriod: "month",
          hideNoSalary: false,
          referralCode: "DEMO-ION",
          onboardingCompletedAt: ago(5 * DAY),
          isDemo: true,
        },
        {
          id: demoId("profile:nino"),
          userId: "demo_user_nino",
          displayName: "Nino (fictional)",
          citizenships: ["GE"],
          residenceCountry: "GE",
          timezone: "Asia/Tbilisi",
          minOverlapHours: 3,
          englishLevel: "c2",
          waysOfWorking: ["b2b_contractor", "eor_employee", "relocation_visa"],
          employmentTypes: ["full_time", "contract_to_hire"],
          titles: ["Data Engineer", "ML Engineer"],
          seniority: "middle",
          yearsExperience: 4,
          stack: ["Python", "dbt", "Airflow", "PyTorch"],
          minRate: 40000,
          minRateCurrency: "USD",
          minRatePeriod: "year",
          includeYellow: true,
          referralCode: "DEMO-NINO",
          onboardingCompletedAt: ago(9 * DAY),
          isDemo: true,
        },
      ])
      .onConflictDoNothing();

    const cvText = (who: string) =>
      `${who} (fictional demo person). Sample CV text for staging only. Not a real person.`;
    await tx
      .insert(cvFiles)
      .values(
        [
          { id: demoId("cv:ana"), userId: "demo_user_ana", who: "Ana Demo" },
          { id: demoId("cv:ion"), userId: "demo_user_ion", who: "Ion Demo" },
          { id: demoId("cv:nino"), userId: "demo_user_nino", who: "Nino Demo" },
          { id: demoId("cv:anon"), userId: "demo_user_anon", who: "Anonymous Demo" },
        ].map(({ who, ...cv }) => ({
          ...cv,
          bucketKey: `demo/${cv.id}.pdf`,
          fileName: `${who.toLowerCase().replace(/\s+/g, "-")}-cv.pdf`,
          mimeType: "application/pdf",
          sizeBytes: 48_213,
          sha256: hash(who),
          extractedText: cvText(who),
          parsed: { demo: true, name: who },
          parseStatus: "parsed" as const,
          parseModel: "demo",
          parsePromptVersion: "demo-v1",
          parsedAt: ago(DAY),
          // Unclaimed anonymous upload: deleted 24h after upload (PLAN D4).
          expiresAt: cv.userId === "demo_user_anon" ? ahead(DAY) : null,
        })),
      )
      .onConflictDoUpdate({ target: cvFiles.id, set: { expiresAt: sql`excluded.expires_at` } });

    // Companies and jobs.
    await tx
      .insert(companies)
      .values(
        COMPANIES.map((c) => ({
          id: companyId(c.slug),
          name: c.name,
          slug: c.slug,
          domain: `${c.slug}.example.com`,
          websiteUrl: `https://${c.slug}.example.com`,
          careersUrl: `https://${c.slug}.example.com/careers`,
          atsType: "other" as const,
          atsBoardToken: `demo-${c.slug}`,
          hqCountry: c.hq,
          evidenceCheckedAt: ago(3 * DAY),
          isDemo: true,
        })),
      )
      .onConflictDoNothing();

    await tx
      .insert(jobs)
      .values(
        JOBS.map((j, i) => {
          const rawText = `${j.title} at a fictional demo company. Stack: ${j.stack.join(", ") || "n/a"}. ${j.reason}.`;
          const closed = j.status === "closed";
          return {
            id: jobId(j.key),
            companyId: companyId(j.company),
            source: "demo",
            externalId: j.key,
            url: `https://${j.company}.example.com/careers/${j.key}`,
            applyUrl: `https://${j.company}.example.com/careers/${j.key}/apply`,
            title: j.title,
            roleFamily: roleFamilyOf(j),
            locationText: j.ways.includes("local") ? "Hybrid" : "Remote",
            rawText,
            contentHash: hash(rawText),
            status: j.status ?? "open",
            postedAt: ago((i + 2) * DAY),
            firstSeenAt: ago((i + 1) * 6 * HOUR),
            lastVerifiedLiveAt: closed ? ago(3 * DAY) : ago((i % 10) * HOUR),
            closedAt: closed ? ago(2 * DAY) : null,
            isDemo: true,
          };
        }),
      )
      .onConflictDoUpdate({
        target: [jobs.companyId, jobs.source, jobs.externalId],
        // Keep the demo Brief fresh: open jobs were "verified" within the last 10 hours.
        set: { lastVerifiedLiveAt: sql`excluded.last_verified_live_at` },
      });

    await tx
      .insert(jobEnrichment)
      .values(
        JOBS.map((j) => ({
          jobId: jobId(j.key),
          roleFamily: roleFamilyOf(j),
          seniority: j.seniority,
          stack: j.stack,
          employmentTypes: ["full_time" as const],
          waysOfWorking: j.ways,
          salaryMin: j.salary?.[0] ?? null,
          salaryMax: j.salary?.[1] ?? null,
          salaryCurrency: j.salary ? "USD" : null,
          salaryPeriod: j.salary?.[2] ?? null,
          eligibilityRules: [
            { scope: "MD", waysOfWorking: j.ways, tier: j.md, reason: j.reason },
            ...(j.ge ? [{ scope: "GE", waysOfWorking: j.ways, tier: j.ge, reason: j.reason }] : []),
          ],
          asksCandidateForMoney: j.key === "j29",
          model: "demo",
          promptVersion: "demo-v1",
        })),
      )
      .onConflictDoNothing();

    await tx
      .insert(jobEligibility)
      .values(
        JOBS.flatMap((j) =>
          j.ways.flatMap((way) => [
            {
              jobId: jobId(j.key),
              scope: "MD",
              wayOfWorking: way,
              tier: j.md,
              reason: j.reason,
              engineVersion: DEMO_ENGINE_VERSION,
              ...demoReason(j, "MD"),
            },
            ...(j.ge
              ? [
                  {
                    jobId: jobId(j.key),
                    scope: "GE",
                    wayOfWorking: way,
                    tier: j.ge,
                    reason: j.reason,
                    engineVersion: DEMO_ENGINE_VERSION,
                    ...demoReason(j, "GE"),
                  },
                ]
              : []),
          ]),
        ),
      )
      .onConflictDoNothing();

    // Flags: one closed-or-fake (auto-resolved), one "doesn't hire from my country" (open).
    await tx
      .insert(flags)
      .values([
        {
          id: demoId("flag:closed-j23"),
          jobId: jobId("j23"),
          userId: "demo_user_ana",
          reason: "closed_or_fake",
          status: "auto_resolved",
          actionTaken: "job_closed",
          resolvedAt: ago(2 * DAY),
        },
        {
          id: demoId("flag:country-j16"),
          jobId: jobId("j16"),
          userId: "demo_user_ion",
          reason: "not_hiring_from_country",
          country: "MD",
          status: "open",
          actionTaken: "reverification_queued",
        },
      ])
      .onConflictDoNothing();

    await tx
      .insert(eligibilityEvidence)
      .values([
        {
          id: demoId("evidence:j01"),
          subject: "job",
          jobId: jobId("j01"),
          scope: "MD",
          wayOfWorking: "b2b_contractor",
          verdict: "green",
          source: "post",
          excerpt: "Contractor countries: Moldova, Georgia, Armenia (demo text)",
          sourceUrl: "https://example-co.example.com/careers/j01",
        },
        {
          id: demoId("evidence:northwind"),
          subject: "company",
          companyId: companyId("northwind-labs"),
          scope: "MD",
          wayOfWorking: "eor_employee",
          verdict: "green",
          source: "careers_page",
          weight: 2,
          excerpt: "We employ people through our EOR partner in Moldova (demo text)",
          sourceUrl: "https://northwind-labs.example.com/careers",
        },
        {
          id: demoId("evidence:flag-j16"),
          subject: "job",
          jobId: jobId("j16"),
          scope: "MD",
          wayOfWorking: "b2b_contractor",
          verdict: "yellow",
          source: "flag",
          weight: 0.5,
          flagId: demoId("flag:country-j16"),
        },
      ])
      .onConflictDoNothing();

    // Matches and near misses.
    type M = {
      user: string;
      job: string;
      score: number;
      tier: Tier;
      way: Way;
      reasons: string[];
      gap?: string;
      blocker?: "eligibility" | "salary_missing" | "seniority" | "score" | "way_of_working";
      state?: "new" | "saved" | "applied" | "passed";
    };
    /** Demo users live where their profile says they do; gate reasons name that country. */
    const HOME: Record<string, CountryCode> = { ana: "MD", ion: "MD", nino: "GE" };

    /**
     * Gate results in the `@pemby/core` shape: core gate spelling, a stable reason key and the
     * params that key fills, never rendered English. Exactly the gate named by `blocker` fails, so
     * every demo near miss reads as one failed gate (PLAN D7); `score` is a blocker, not a gate,
     * so a `score` near miss has every gate passing.
     */
    function demoGateResults(m: M): GateResult[] {
      const country = countryName(HOME[m.user] ?? "MD") ?? "Moldova";
      const failed = (gate: HardGate) =>
        m.blocker !== undefined && m.blocker !== "score" && fromDbGate(m.blocker) === gate;
      const result = (
        gate: HardGate,
        passKey: GateReasonKey,
        failKey: GateReasonKey,
        params: Record<string, string>,
      ): GateResult => ({
        gate,
        passed: !failed(gate),
        reasonKey: failed(gate) ? failKey : passKey,
        reasonParams: params,
        notes: [],
      });
      return [
        result("eligibility", "eligibility-allowed", "eligibility-blocked", {
          tier: m.tier,
          country,
        }),
        result("way-of-working", "way-accepted", "way-not-accepted", { way: fromDbWay(m.way) }),
        result("freshness", "freshness-ok", "freshness-stale", { hours: "6", limit: "24" }),
        result("seniority", "seniority-match", "seniority-above", {
          jobSeniority: "senior",
          userSeniority: "middle",
        }),
        result("dealbreaker", "dealbreaker-none", "dealbreaker-hit", { dealbreaker: "on-call" }),
        result("salary", "salary-no-floor", "salary-below-floor", {}),
        result("salary-missing", "salary-listed", "salary-missing-hidden", {}),
      ];
    }

    const M_ROWS: M[] = [
      {
        user: "ana",
        job: "j13",
        score: 92,
        tier: "green",
        way: "eor_employee",
        reasons: ["TypeScript, Node.js, PostgreSQL match", "4h+ overlap", "Pays above your floor"],
        gap: "No Kafka on your CV",
        state: "applied",
      },
      {
        user: "ana",
        job: "j01",
        score: 88,
        tier: "green",
        way: "b2b_contractor",
        reasons: [
          "Go, PostgreSQL match",
          "Hires contractors from Moldova",
          "Pays above your floor",
        ],
        gap: "No Kubernetes on your CV",
        state: "saved",
      },
      {
        user: "ana",
        job: "j04",
        score: 86,
        tier: "green",
        way: "eor_employee",
        reasons: ["TypeScript, Node.js match", "EOR covers Moldova", "Senior level fits"],
        gap: "React is listed; your CV is backend-heavy",
      },
      {
        user: "ana",
        job: "j02",
        score: 81,
        tier: "green",
        way: "b2b_contractor",
        reasons: ["Go matches", "Hires from Moldova", "Pays well above your floor"],
        gap: "Lead level, one above yours",
      },
      {
        user: "ana",
        job: "j28",
        score: 80,
        tier: "green",
        way: "b2b_contractor",
        reasons: ["Go matches", "Worldwide contractors", "Distributed systems"],
        gap: "Principal level",
        state: "passed",
      },
      {
        user: "ana",
        job: "j21",
        score: 70,
        tier: "green",
        way: "b2b_contractor",
        reasons: ["Worldwide contractors"],
        gap: "No Rust on your CV",
        blocker: "score",
      },
      // An eligibility near miss has to be yellow to be demo-worthy at all: PLAN D2 as amended
      // 2026-09-17 is that white and red never show, so a white or red fixture is a row the
      // product is forbidden to render, and the one-tap "include the likely ones" fix it is meant
      // to demonstrate only ever reaches yellow posts.
      {
        user: "ana",
        job: "j22",
        score: 84,
        tier: "yellow",
        way: "eor_employee",
        reasons: ["TypeScript matches"],
        blocker: "eligibility",
      },
      {
        user: "ana",
        job: "j11",
        score: 82,
        tier: "green",
        way: "b2b_contractor",
        reasons: ["Hires from Moldova"],
        blocker: "salary_missing",
      },
      {
        user: "ion",
        job: "j20",
        score: 90,
        tier: "green",
        way: "b2b_contractor",
        reasons: ["TypeScript, React match", "Junior level fits", "Hires from Moldova"],
        gap: "No testing experience listed",
      },
      {
        user: "ion",
        job: "j27",
        score: 81,
        tier: "green",
        way: "local",
        reasons: ["Hybrid in Chișinău", "Junior level fits", "Pays above your floor"],
        gap: "Cypress not on your CV",
      },
      {
        user: "ion",
        job: "j03",
        score: 83,
        tier: "yellow",
        way: "b2b_contractor",
        reasons: ["React matches"],
        blocker: "eligibility",
      },
      {
        user: "ion",
        job: "j30",
        score: 78,
        tier: "green",
        way: "b2b_contractor",
        reasons: ["TypeScript, React match"],
        blocker: "seniority",
      },
      {
        user: "ion",
        job: "j24",
        score: 76,
        tier: "green",
        way: "paid_program",
        reasons: ["Open to students worldwide"],
        blocker: "score",
      },
      {
        user: "nino",
        job: "j10",
        score: 91,
        tier: "green",
        way: "b2b_contractor",
        reasons: ["Python, dbt, Airflow match", "Hires from Georgia", "Pays above your floor"],
        gap: "No Snowflake on your CV",
        state: "applied",
      },
      {
        user: "nino",
        job: "j08",
        score: 84,
        tier: "green",
        way: "relocation_visa",
        reasons: ["Relocation with visa", "Any nationality", "Pays above your floor"],
        gap: "Java and Kotlin not on your CV",
      },
      {
        user: "nino",
        job: "j11",
        score: 83,
        tier: "green",
        way: "b2b_contractor",
        reasons: ["Python, PyTorch match", "Hires from Georgia"],
        gap: "Senior level, one above yours",
      },
      {
        user: "nino",
        job: "j16",
        score: 72,
        tier: "yellow",
        way: "b2b_contractor",
        reasons: ["Timezone fits"],
        blocker: "score",
      },
      // Was j12, which is red for Georgia — a post the Brief must never name (PLAN D2). j19 is
      // green there and freelance-only, which Nino does not accept, so the group still
      // demonstrates exactly one failed gate without putting a red post on screen.
      {
        user: "nino",
        job: "j19",
        score: 74,
        tier: "green",
        way: "freelance",
        reasons: ["Timezone fits"],
        blocker: "way_of_working",
      },
    ];

    await tx
      .insert(matches)
      .values(
        M_ROWS.map((m) => ({
          id: demoId(`match:${m.user}:${m.job}`),
          userId: `demo_user_${m.user}`,
          jobId: jobId(m.job),
          kind: m.blocker ? ("near_miss" as const) : ("match" as const),
          blocker: m.blocker ?? null,
          score: m.score,
          tier: m.tier,
          wayOfWorking: m.way,
          reasons: m.reasons,
          gap: m.gap ?? null,
          state: m.state ?? "new",
          passReason: m.state === "passed" ? ("seniority" as const) : null,
          stateChangedAt: m.state ? ago(DAY) : null,
          gateResults: demoGateResults(m),
          // Hand-written fixtures, not an older scorer's leftovers: stamped current so a re-match
          // for a demo user does not retire the demo Brief out from under the demo.
          scorerVersion: SCORER_VERSION,
          deliverAfter: m.blocker ? null : ago(2 * HOUR),
          telegramDeliveredAt: !m.blocker && m.user === "ana" ? ago(HOUR) : null,
          emailDeliveredAt: !m.blocker && m.user !== "ana" ? ago(HOUR) : null,
        })),
      )
      .onConflictDoNothing();

    await tx
      .insert(applications)
      .values([
        {
          id: demoId("application:ana:j13"),
          userId: "demo_user_ana",
          jobId: jobId("j13"),
          matchId: demoId("match:ana:j13"),
          state: "interviewing",
          appliedAt: ago(6 * DAY),
        },
        {
          id: demoId("application:nino:j10"),
          userId: "demo_user_nino",
          jobId: jobId("j10"),
          matchId: demoId("match:nino:j10"),
          state: "applied",
          appliedAt: ago(2 * DAY),
        },
      ])
      .onConflictDoNothing();

    await tx
      .insert(kits)
      .values({
        id: demoId("kit:ana:j13"),
        userId: "demo_user_ana",
        jobId: jobId("j13"),
        matchId: demoId("match:ana:j13"),
        content: {
          cvBullets: ["Demo bullet: built a payments ledger in Node.js and PostgreSQL (fictional)"],
          coverLetter: "Demo cover letter text for staging (fictional).",
          screeningAnswers: [{ question: "Notice period?", answer: "Two weeks (demo)" }],
        },
        model: "demo",
        promptVersion: "demo-v1",
        keyClass: "private",
        costUsd: "0.004200",
      })
      .onConflictDoNothing();

    await tx
      .insert(aiUsage)
      .values([
        {
          id: demoId("ai:enrich"),
          task: "job-enrichment",
          model: "demo",
          keyClass: "public",
          promptVersion: "demo-v1",
          inputTokens: 1800,
          outputTokens: 400,
        },
        {
          id: demoId("ai:cv:ana"),
          userId: "demo_user_ana",
          task: "cv-parse",
          model: "demo",
          keyClass: "private",
          promptVersion: "demo-v1",
          inputTokens: 2400,
          outputTokens: 700,
          costUsd: "0.000520",
        },
        {
          id: demoId("ai:kit:ana"),
          userId: "demo_user_ana",
          task: "application-kit",
          model: "demo",
          keyClass: "private",
          promptVersion: "demo-v1",
          inputTokens: 3100,
          outputTokens: 900,
          costUsd: "0.004200",
        },
      ])
      .onConflictDoNothing();

    // Billing: Ana bought a 3-month pass; Nino was referred by Ana and both got +14 days.
    await tx
      .insert(payments)
      .values({
        id: demoId("payment:ana"),
        userId: "demo_user_ana",
        provider: "paddle",
        providerRef: "demo_txn_0001",
        product: "pass_3m",
        amountCents: 1000,
        status: "paid",
        paidAt: ago(10 * DAY),
      })
      .onConflictDoNothing();

    await tx
      .insert(referrals)
      .values({
        id: demoId("referral:ana:nino"),
        referrerUserId: "demo_user_ana",
        refereeUserId: "demo_user_nino",
        code: "DEMO-ANA",
        status: "qualified",
        qualifiedAt: ago(9 * DAY),
      })
      .onConflictDoNothing();

    await tx
      .insert(passes)
      .values([
        {
          id: demoId("pass:ana:purchase"),
          userId: "demo_user_ana",
          source: "purchase",
          startsAt: ago(10 * DAY),
          endsAt: ahead(80 * DAY),
          paymentId: demoId("payment:ana"),
        },
        {
          id: demoId("pass:ana:referral"),
          userId: "demo_user_ana",
          source: "referral",
          startsAt: ahead(80 * DAY),
          endsAt: ahead(94 * DAY),
          referralId: demoId("referral:ana:nino"),
        },
        {
          id: demoId("pass:nino:referral"),
          userId: "demo_user_nino",
          source: "referral",
          startsAt: ago(9 * DAY),
          endsAt: ahead(5 * DAY),
          referralId: demoId("referral:ana:nino"),
        },
      ])
      .onConflictDoUpdate({
        target: passes.id,
        set: { startsAt: sql`excluded.starts_at`, endsAt: sql`excluded.ends_at` },
      });

    // Channels and deliveries.
    await tx
      .insert(channels)
      .values([
        {
          id: demoId("channel:ana:tg"),
          userId: "demo_user_ana",
          type: "telegram",
          address: "demo-chat-ana",
          verifiedAt: ago(20 * DAY),
          quietStartMinute: 22 * 60,
          quietEndMinute: 8 * 60,
          timezone: "Europe/Chisinau",
        },
        {
          id: demoId("channel:ion:email"),
          userId: "demo_user_ion",
          type: "email",
          address: "ion.demo@example.com",
          verifiedAt: ago(5 * DAY),
        },
        {
          id: demoId("channel:nino:email"),
          userId: "demo_user_nino",
          type: "email",
          address: "nino.demo@example.com",
          verifiedAt: ago(9 * DAY),
          timezone: "Asia/Tbilisi",
        },
      ])
      .onConflictDoNothing();

    await tx
      .insert(deliveryLog)
      .values([
        {
          id: demoId("delivery:ana:j13"),
          userId: "demo_user_ana",
          matchId: demoId("match:ana:j13"),
          channelId: demoId("channel:ana:tg"),
          channelType: "telegram",
          kind: "match",
          status: "sent",
          providerMessageId: "demo-1",
        },
        {
          id: demoId("delivery:ion:j20"),
          userId: "demo_user_ion",
          matchId: demoId("match:ion:j20"),
          channelId: demoId("channel:ion:email"),
          channelType: "email",
          kind: "match",
          status: "sent",
          late: true,
          providerMessageId: "demo-2",
        },
        {
          id: demoId("delivery:nino:reminder"),
          userId: "demo_user_nino",
          channelId: demoId("channel:nino:email"),
          channelType: "email",
          kind: "pass_reminder",
          status: "sent",
          providerMessageId: "demo-3",
        },
      ])
      .onConflictDoNothing();
  });
}

const db = createDb(url, { max: 1 });
try {
  await seed(db);
  console.log(
    `seeded demo data: ${COMPANIES.length} companies, ${JOBS.length} jobs, ${USERS.length} users`,
  );
} finally {
  await db.$client.end();
}
