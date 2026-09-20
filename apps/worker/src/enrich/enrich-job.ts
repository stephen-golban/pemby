// Enrichment of one job: rules, one structured model call on the public key, LLM signals, company
// evidence, then the eligibility engine for the target countries. `computeEnrichment` never writes
// job tables (the model call still writes its `ai_usage` rows through the ledger it is given);
// `writeEnrichment` stores the result in one transaction.
//
// Privacy: public job posts only. Nothing here logs post text, prompt text or model output.
import {
  runStructuredTask,
  type CostLedger,
  type DailyCapGuard,
  type EnvLike,
  type RouteOverride,
  type StructuredTaskResult,
} from "@pemby/ai";
import {
  ENGINE_VERSION,
  RULES_VERSION,
  TARGET_COUNTRIES,
  buildEnrichmentInput,
  decideEligibility,
  extractRuleSignals,
  isCountryCode,
  jobEnrichmentOutputSchema,
  llmToSignals,
  type CompanyEvidenceInput,
  type EligibilitySignal,
  type EngineVerdict,
  type EnrichmentPost,
  type JobEnrichmentOutput,
  type LlmSignalsResult,
  type RuleExtraction,
  type WayOfWorking,
} from "@pemby/core";
import { schema, type Db, type NewEligibilityEvidence, type NewJobEligibility } from "@pemby/db";
import { and, asc, eq, gt, isNull, sql } from "drizzle-orm";
import { renderHints, type EnrichmentHint } from "./hints";

const { companies, eligibilityEvidence, jobEligibility, jobEnrichment, jobs } = schema;

/**
 * Ways of working decided for remote roles. `local` needs the job's own location against the
 * person's country and `paid-program` needs the programs calendar; both come later (phase 05 keeps
 * them out of the engine run and the eval).
 */
export const ENRICH_WAYS = [
  "b2b-contractor",
  "eor-employee",
  "freelance",
  "relocation-visa",
] as const satisfies readonly WayOfWorking[];

/** Per model request. Two models with one repair retry each fit in the queue's 15-minute expiry. */
export const ENRICH_CALL_TIMEOUT_MS = 180_000;

type DbWay = NonNullable<NewJobEligibility["wayOfWorking"]>;
const toDbWay = (way: WayOfWorking) => way.replace(/-/g, "_") as DbWay;
const fromDbWay = (way: string) => way.replace(/_/g, "-") as WayOfWorking;

export interface EnrichDeps {
  db: Db;
  ledger: CostLedger;
  capGuard: DailyCapGuard;
  /** Stored in `ai_usage.run_label`, e.g. `sweep`, `sample`, `enrich-once`. */
  runLabel?: string | null;
  /** Pins one model (enrich:once --model). */
  routeOverride?: RouteOverride;
  /** Replaces `loadCompanyEvidence(db, companyId)`. */
  companyEvidence?: (companyId: string) => Promise<CompanyEvidenceInput[]>;
  env?: EnvLike;
  /** pg-boss `job.signal`: aborts the model call when the job expires or the worker stops. */
  abortSignal?: AbortSignal;
}

export type SkipReason = "not-found" | "not-open" | "demo" | "duplicate" | "up-to-date";

interface LoadedJob {
  id: string;
  companyId: string;
  companyName: string;
  url: string;
  title: string;
  locations: string[];
  workplaceType: string | null;
  employmentType: string | null;
  rawText: string;
  roleFamily: string | null;
  contentHash: string;
  status: string;
  isDemo: boolean;
  duplicateOfJobId: string | null;
}

export interface EnrichmentComputation {
  job: LoadedJob;
  post: EnrichmentPost;
  rules: RuleExtraction;
  ai: StructuredTaskResult<JobEnrichmentOutput>;
  llm: LlmSignalsResult;
  company: CompanyEvidenceInput[];
  verdicts: EngineVerdict[];
}

export type ComputeResult =
  | { kind: "skipped"; jobId: string; reason: SkipReason }
  | { kind: "computed"; value: EnrichmentComputation };

async function loadJob(db: Db, jobId: string): Promise<LoadedJob | null> {
  const [job] = await db
    .select({
      id: jobs.id,
      companyId: jobs.companyId,
      companyName: companies.name,
      url: jobs.url,
      title: jobs.title,
      locations: jobs.locations,
      workplaceType: jobs.workplaceType,
      employmentType: jobs.employmentType,
      rawText: jobs.rawText,
      roleFamily: jobs.roleFamily,
      contentHash: jobs.contentHash,
      status: jobs.status,
      isDemo: jobs.isDemo,
      duplicateOfJobId: jobs.duplicateOfJobId,
    })
    .from(jobs)
    .innerJoin(companies, eq(companies.id, jobs.companyId))
    .where(eq(jobs.id, jobId));
  return job ?? null;
}

/** The stored enrichment's content hash; null when the job has no enrichment row. */
async function enrichedContentHash(db: Db, jobId: string): Promise<{ hash: string | null } | null> {
  const [row] = await db
    .select({ hash: jobEnrichment.contentHash })
    .from(jobEnrichment)
    .where(eq(jobEnrichment.jobId, jobId));
  return row ?? null;
}

/** Company-level evidence rows as engine input. Region scopes are left to the country rows. */
export async function loadCompanyEvidence(
  db: Db,
  companyId: string,
): Promise<CompanyEvidenceInput[]> {
  const rows = await db
    .select()
    .from(eligibilityEvidence)
    .where(
      and(eq(eligibilityEvidence.subject, "company"), eq(eligibilityEvidence.companyId, companyId)),
    );
  const out: CompanyEvidenceInput[] = [];
  for (const row of rows) {
    if (row.scope !== "*" && !isCountryCode(row.scope)) continue;
    if (row.source === "post") continue;
    out.push({
      country: row.scope,
      wayOfWorking: row.wayOfWorking ? fromDbWay(row.wayOfWorking) : null,
      verdict: row.verdict,
      excerpt: row.excerpt,
      sourceUrl: row.sourceUrl,
      fetchedAt: row.fetchedAt,
      source: row.source,
      weight: row.weight,
    });
  }
  return out;
}

export type JobText = Pick<
  LoadedJob,
  "title" | "companyName" | "locations" | "workplaceType" | "employmentType" | "rawText"
>;

/**
 * The post as the engine reads it. Exported so an offline recompute (the eligibility-reason
 * backfill) runs the *same* code path as enrichment rather than a second copy of it: a reason key
 * derived from a drifted copy would be worse than no key at all.
 */
export function postOf(job: JobText): EnrichmentPost {
  return {
    title: job.title,
    company: job.companyName,
    locations: job.locations,
    workplaceType: job.workplaceType,
    employmentType: job.employmentType,
    descriptionText: job.rawText,
  };
}

/** The rules pass over the job text. Exported for the same reason as `postOf`. */
export function rulesOf(job: JobText): RuleExtraction {
  return extractRuleSignals({
    title: job.title,
    locations: job.locations,
    workplaceType: job.workplaceType,
    employmentType: job.employmentType,
    descriptionText: job.rawText,
    // TODO(phase 05+): ingestion does not store the posting page's JSON-LD yet. When it is wired
    // here, keep the rules' discount for `applicantLocationRequirements` that only copies
    // `jobLocation` (Google's fallback, research 02 §4.2): it must stay weak, never a residence rule.
    jsonLd: null,
  });
}

/** Everything short of the database writes. Throws the `@pemby/ai` errors unchanged. */
export async function computeEnrichment(
  deps: EnrichDeps,
  jobId: string,
  /**
   * `force` skips the content-hash short circuit. A flag-triggered re-run **must** pass it: the
   * job's text has not changed because someone reported it, so without `force` the whole run is
   * `skipped: "up-to-date"` and nothing happens.
   *
   * `hints` are the fixed picker values from a `wrong_details` flag, rendered by `./hints.ts` and
   * appended after everything `buildEnrichmentInput` produces — so the input's section offsets are
   * untouched and a quote from the hint verifies against no section and is dropped. Public post
   * text on the public key; free text never gets here (see `./hints.ts`).
   */
  options: { force?: boolean; hints?: readonly EnrichmentHint[] } = {},
): Promise<ComputeResult> {
  const job = await loadJob(deps.db, jobId);
  const skip = (reason: SkipReason): ComputeResult => ({ kind: "skipped", jobId, reason });
  if (!job) return skip("not-found");
  if (job.status !== "open") return skip("not-open");
  if (job.isDemo) return skip("demo");
  if (job.duplicateOfJobId !== null) return skip("duplicate");
  if (!options.force) {
    const enriched = await enrichedContentHash(deps.db, jobId);
    if (enriched && enriched.hash === job.contentHash) return skip("up-to-date");
  }

  const post = postOf(job);
  const rules = rulesOf(job);
  const ai = await runStructuredTask({
    task: "job-enrichment",
    schema: jobEnrichmentOutputSchema,
    input: buildEnrichmentInput(post).text + renderHints(options.hints ?? []),
    ledger: deps.ledger,
    capGuard: deps.capGuard,
    context: { jobId: job.id, companyId: job.companyId, runLabel: deps.runLabel ?? null },
    // The free Nemotron endpoint took 50 to 100 s per post in phase 05 checks.
    timeoutMs: ENRICH_CALL_TIMEOUT_MS,
    ...(deps.routeOverride ? { routeOverride: deps.routeOverride } : {}),
    ...(deps.env ? { env: deps.env } : {}),
    ...(deps.abortSignal ? { abortSignal: deps.abortSignal } : {}),
  });
  const llm = llmToSignals(ai.data, post);
  const company = deps.companyEvidence
    ? await deps.companyEvidence(job.companyId)
    : await loadCompanyEvidence(deps.db, job.companyId);
  const verdicts = decideEligibility({
    rules,
    llm: { signals: llm.signals, model: ai.model },
    company,
    countries: TARGET_COUNTRIES,
    ways: ENRICH_WAYS,
    postUrl: job.url,
  });
  return { kind: "computed", value: { job, post, rules, ai, llm, company, verdicts } };
}

const round = (value: number | null) => (value === null ? null : Math.round(value));
const unique = (values: readonly string[], max: number) =>
  [...new Set(values.map((v) => v.trim()).filter(Boolean))].slice(0, max);

/** Statement kinds that can back a post-level evidence row. */
const STATEMENT_KINDS: ReadonlySet<EligibilitySignal["kind"]> = new Set([
  "allow-list",
  "exclude",
  "worldwide",
  "work-authorization",
  "citizenship-or-clearance",
]);

/**
 * Reason keys whose tier comes from a post statement itself. Other keys are caps, guesses, company
 * evidence or conflicts: their tier is not what any one sentence says, so no evidence row is
 * written for them (review C2c: never a green row for a capped reason).
 */
const STATEMENT_REASONS: Readonly<Record<"green" | "yellow" | "red", ReadonlySet<string>>> = {
  green: new Set(["country-named", "worldwide-engagement"]),
  yellow: new Set(["region-includes", "worldwide", "country-mentioned", "timezone-includes"]),
  red: new Set([
    "places-only",
    "excluded",
    "work-authorization",
    "citizenship",
    "onsite-elsewhere",
    "timezone-required",
    "employee-only",
    "contractor-only",
    "relocation-elsewhere",
  ]),
};

/**
 * Post-level `eligibility_evidence` rows (reviews m1 and C2c). A statement is not a verdict, so a
 * row is written only where a post statement decided the engine's verdict: a green, yellow or red
 * verdict for a target country and way of working, whose reason key is a statement reason (not a
 * cap), and whose first (deciding) evidence item is a non-weak rules or LLM statement. The row
 * copies the engine's tier. Country scopes only; no region or `*` rows.
 */
interface DecisionInput {
  jobId: string;
  rules: RuleExtraction;
  llmSignals: readonly EligibilitySignal[];
  verdicts: readonly EngineVerdict[];
  /** Prompt `versionId` the LLM signals came from. */
  promptVersion: string;
}

function postEvidenceRows(c: DecisionInput, fetchedAt: Date): NewEligibilityEvidence[] {
  const statements = [
    ...c.rules.signals.filter((s) => s.source === "rules" || s.source === "schema-org"),
    ...c.llmSignals,
  ].filter((s) => STATEMENT_KINDS.has(s.kind) && s.strength !== "weak" && s.evidence.text !== "");
  const byExcerpt = new Map<string, EligibilitySignal>();
  for (const signal of statements) {
    // Rules first: when both extractors quote the same span, the rules version is recorded.
    if (!byExcerpt.has(signal.evidence.text)) byExcerpt.set(signal.evidence.text, signal);
  }

  const rows = new Map<string, NewEligibilityEvidence>();
  for (const verdict of c.verdicts) {
    if (verdict.tier === "white" || !isCountryCode(verdict.country)) continue;
    if (!STATEMENT_REASONS[verdict.tier].has(verdict.reasonKey)) continue;
    const deciding = verdict.evidence[0];
    if (!deciding || deciding.source !== "post" || !deciding.excerpt) continue;
    const signal = byExcerpt.get(deciding.excerpt);
    if (!signal) continue;
    const wayOfWorking = toDbWay(verdict.wayOfWorking);
    const excerpt = deciding.excerpt.slice(0, 500);
    const key = `${verdict.country}|${wayOfWorking}|${excerpt}`;
    if (rows.has(key)) continue;
    rows.set(key, {
      subject: "job",
      jobId: c.jobId,
      scope: verdict.country,
      wayOfWorking,
      verdict: verdict.tier,
      source: "post",
      weight: 1,
      excerpt,
      sourceUrl: deciding.url,
      fetchedAt,
      extractorVersion: signal.source === "llm" ? c.promptVersion : RULES_VERSION,
    });
  }
  return [...rows.values()];
}

export interface WriteSummary {
  /** Set when nothing was written because the job changed while the model ran. */
  skipped: "not-open" | "duplicate" | "content-changed" | null;
  eligibilityRows: number;
  evidenceRows: number;
}

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

function eligibilityRowsOf(jobId: string, verdicts: readonly EngineVerdict[]): NewJobEligibility[] {
  return verdicts.map((v) => ({
    jobId,
    scope: v.country,
    wayOfWorking: toDbWay(v.wayOfWorking),
    tier: v.tier,
    reason: v.reason,
    // The engine already knows the key and its params; `reason` is only their English rendering.
    // Storing all three (migration 0008) lets the Brief and the teaser render a verdict through
    // i18n instead of recovering the key with a regex over the English templates.
    reasonKey: v.reasonKey,
    reasonParams: v.reasonParams,
    evidence: v.evidence.map((e) => ({ source: String(e.source), excerpt: e.excerpt, url: e.url })),
    engineVersion: ENGINE_VERSION,
  }));
}

/**
 * Locks the job row and says why a write must be skipped: the job closed, was merged into another,
 * or its text changed since `contentHash` was read. Null when the write may go ahead.
 */
async function lockJob(
  tx: Tx,
  jobId: string,
  contentHash: string,
): Promise<WriteSummary["skipped"]> {
  const [row] = await tx
    .select({
      status: jobs.status,
      duplicateOfJobId: jobs.duplicateOfJobId,
      contentHash: jobs.contentHash,
    })
    .from(jobs)
    .where(eq(jobs.id, jobId))
    .for("update");
  if (!row || row.status !== "open") return "not-open";
  if (row.duplicateOfJobId !== null) return "duplicate";
  if (row.contentHash !== contentHash) return "content-changed";
  return null;
}

async function replaceEligibility(
  tx: Tx,
  jobId: string,
  eligibilityRows: readonly NewJobEligibility[],
  evidenceRows: readonly NewEligibilityEvidence[],
): Promise<void> {
  await tx.delete(jobEligibility).where(eq(jobEligibility.jobId, jobId));
  if (eligibilityRows.length > 0) await tx.insert(jobEligibility).values([...eligibilityRows]);
  await tx
    .delete(eligibilityEvidence)
    .where(
      and(
        eq(eligibilityEvidence.subject, "job"),
        eq(eligibilityEvidence.jobId, jobId),
        eq(eligibilityEvidence.source, "post"),
      ),
    );
  if (evidenceRows.length > 0) await tx.insert(eligibilityEvidence).values([...evidenceRows]);
}

/**
 * One transaction: lock the job row (skip when it closed, merged or changed since it was read),
 * upsert job_enrichment, replace job_eligibility and the job's post evidence.
 */
export async function writeEnrichment(
  db: Db,
  c: EnrichmentComputation,
  now: Date = new Date(),
): Promise<WriteSummary> {
  const out = c.ai.data;
  const salary = out.salary;
  const currency = salary?.currency?.trim().toUpperCase() ?? null;
  const tz = out.timezone;
  const enrichment = {
    roleFamily: c.job.roleFamily,
    seniority: out.seniority,
    yearsMin: out.yearsMin === null ? null : Math.min(40, Math.max(0, Math.round(out.yearsMin))),
    stack: unique(out.stack, 15),
    domains: unique(out.domains, 3),
    employmentTypes: [...new Set(out.employmentTypes)].map(
      (t) => t.replace(/-/g, "_") as "full_time" | "part_time" | "contract_to_hire",
    ),
    waysOfWorking: [...new Set(out.waysOfWorking)].map(toDbWay),
    salaryMin: round(salary?.min ?? null),
    salaryMax: round(salary?.max ?? null),
    salaryCurrency: currency && /^[A-Z]{3}$/.test(currency) ? currency : null,
    salaryPeriod: salary?.period ?? null,
    timezoneRequirement: tz ? tz.quote.slice(0, 300) : null,
    timezoneConstraint: tz
      ? {
          minUtcOffset: tz.minUtcOffset,
          maxUtcOffset: tz.maxUtcOffset,
          overlapHours: tz.overlapHours,
          zones: [],
          excerpt: tz.quote.slice(0, 300),
        }
      : null,
    visaSponsorship: out.visaSponsorship,
    redFlags: unique(out.redFlags, 10),
    eligibilityRules: [],
    asksCandidateForMoney: c.llm.asksCandidateForMoney,
    model: c.ai.model,
    promptVersion: c.ai.promptVersion,
    keyClass: c.ai.keyClass,
    contentHash: c.job.contentHash,
    output: out as unknown as Record<string, unknown>,
    rulesVersion: c.rules.rulesVersion,
    enrichedAt: now,
    updatedAt: now,
  };
  const eligibilityRows = eligibilityRowsOf(c.job.id, c.verdicts);
  const evidenceRows = postEvidenceRows(
    {
      jobId: c.job.id,
      rules: c.rules,
      llmSignals: c.llm.signals,
      verdicts: c.verdicts,
      promptVersion: c.ai.promptVersion,
    },
    now,
  );

  return db.transaction(async (tx) => {
    const skipped = await lockJob(tx, c.job.id, c.job.contentHash);
    if (skipped) return { skipped, eligibilityRows: 0, evidenceRows: 0 };
    await tx
      .insert(jobEnrichment)
      .values({ jobId: c.job.id, ...enrichment })
      .onConflictDoUpdate({ target: jobEnrichment.jobId, set: enrichment });
    await replaceEligibility(tx, c.job.id, eligibilityRows, evidenceRows);
    return {
      skipped: null,
      eligibilityRows: eligibilityRows.length,
      evidenceRows: evidenceRows.length,
    };
  });
}

const RECOMPUTE_BATCH = 50;

/**
 * Rebuilds `job_eligibility` and post evidence for every open, non-demo, canonical job of a company
 * that has an enrichment, with no model call (review M4): rules re-extracted from the job text, LLM
 * signals from the stored `job_enrichment.output`, company evidence reloaded once. Called after
 * company evidence changes. Jobs whose enrichment is stale (content hash differs) or whose stored
 * output no longer parses are left for the sweep. One transaction per batch of 50.
 */
export async function recomputeEligibilityForCompany(
  db: Db,
  companyId: string,
  opts: { batchSize?: number; now?: Date } = {},
): Promise<{ jobs: number }> {
  const batchSize = opts.batchSize ?? RECOMPUTE_BATCH;
  const now = opts.now ?? new Date();
  const company = await loadCompanyEvidence(db, companyId);
  let updated = 0;
  let afterId: string | null = null;

  for (;;) {
    const rows = await db
      .select({
        id: jobs.id,
        companyName: companies.name,
        url: jobs.url,
        title: jobs.title,
        locations: jobs.locations,
        workplaceType: jobs.workplaceType,
        employmentType: jobs.employmentType,
        rawText: jobs.rawText,
        contentHash: jobs.contentHash,
        output: jobEnrichment.output,
        model: jobEnrichment.model,
        promptVersion: jobEnrichment.promptVersion,
      })
      .from(jobs)
      .innerJoin(companies, eq(companies.id, jobs.companyId))
      .innerJoin(jobEnrichment, eq(jobEnrichment.jobId, jobs.id))
      .where(
        and(
          eq(jobs.companyId, companyId),
          eq(jobs.status, "open"),
          eq(jobs.isDemo, false),
          isNull(jobs.duplicateOfJobId),
          eq(jobEnrichment.contentHash, jobs.contentHash),
          afterId === null ? undefined : gt(jobs.id, afterId),
        ),
      )
      .orderBy(asc(jobs.id))
      .limit(batchSize);
    if (rows.length === 0) break;
    afterId = rows[rows.length - 1]!.id;

    const writes: {
      jobId: string;
      contentHash: string;
      eligibility: NewJobEligibility[];
      evidence: NewEligibilityEvidence[];
    }[] = [];
    for (const row of rows) {
      const parsed = jobEnrichmentOutputSchema.safeParse(row.output);
      if (!parsed.success) continue;
      const post = postOf(row);
      const rules = rulesOf(row);
      const llm = llmToSignals(parsed.data, post);
      const verdicts = decideEligibility({
        rules,
        llm: { signals: llm.signals, model: row.model },
        company,
        countries: TARGET_COUNTRIES,
        ways: ENRICH_WAYS,
        postUrl: row.url,
        now,
      });
      writes.push({
        jobId: row.id,
        contentHash: row.contentHash,
        eligibility: eligibilityRowsOf(row.id, verdicts),
        evidence: postEvidenceRows(
          {
            jobId: row.id,
            rules,
            llmSignals: llm.signals,
            verdicts,
            promptVersion: row.promptVersion,
          },
          now,
        ),
      });
    }

    updated += await db.transaction(async (tx) => {
      let n = 0;
      for (const w of writes) {
        if (await lockJob(tx, w.jobId, w.contentHash)) continue;
        await replaceEligibility(tx, w.jobId, w.eligibility, w.evidence);
        n += 1;
      }
      return n;
    });
    if (rows.length < batchSize) break;
  }
  return { jobs: updated };
}

/** Fixed key for the ENRICH_SAMPLE_MAX_JOBS check ("pemby-enrich-sample" as two int4). */
const SAMPLE_LOCK_KEY = [0x70656d62, 0x656e7273] as const;

/**
 * ENRICH_SAMPLE_MAX_JOBS gate (review minor 3). True when `jobId` may be enriched: it already has an
 * enrichment row (re-enrichment never grows the count), or enriched rows plus enrichments in flight
 * for other jobs stay under `max`. In flight means an active `enrich.job` for a job with no row yet.
 * The check runs under a transaction-level advisory lock, so two starts never count each other
 * out of order; each running handler is itself an active job, which reserves its slot. enrich:once
 * runs outside pg-boss, so one enrich:once process can overshoot by its own single in-flight job.
 */
export async function sampleSlotAvailable(db: Db, max: number, jobId: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(${SAMPLE_LOCK_KEY[0]}, ${SAMPLE_LOCK_KEY[1]})`,
    );
    const [own] = await tx
      .select({ id: jobEnrichment.jobId })
      .from(jobEnrichment)
      .where(eq(jobEnrichment.jobId, jobId));
    if (own) return true;
    const [enriched] = await tx.select({ n: sql<number>`count(*)::int` }).from(jobEnrichment);
    const queue = await tx.execute<{ present: boolean }>(
      sql`select to_regclass('pgboss.job') is not null as present`,
    );
    let inFlight = 0;
    if (queue.rows[0]?.present) {
      const active = await tx.execute<{ n: number }>(sql`
        select count(*)::int as n from pgboss.job q
         where q.name = 'enrich.job' and q.state = 'active'
           and q.singleton_key is distinct from ${jobId}
           and not exists (select 1 from job_enrichment e where e.job_id::text = q.singleton_key)`);
      inFlight = Number(active.rows[0]?.n ?? 0);
    }
    return Number(enriched?.n ?? 0) + inFlight < max;
  });
}

/** Rows in `job_enrichment`, for ENRICH_SAMPLE_MAX_JOBS. */
export async function countEnrichedJobs(db: Db): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(jobEnrichment);
  return Number(row?.n ?? 0);
}

/** One line per tier count, e.g. `MD b2b-contractor:white eor-employee:red`. No post text. */
export function tierSummary(verdicts: readonly EngineVerdict[]): string[] {
  const byCountry = new Map<string, string[]>();
  for (const v of verdicts) {
    const list = byCountry.get(v.country) ?? [];
    list.push(`${v.wayOfWorking}:${v.tier}`);
    byCountry.set(v.country, list);
  }
  return [...byCountry].map(([country, parts]) => `${country} ${parts.join(" ")}`);
}
