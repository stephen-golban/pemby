// Fills `job_eligibility.reason_key` and `.reason_params` for rows written before migration 0008,
// with **no model call**.
//
// Usage: pnpm --filter @pemby/worker backfill:reasons -- [--batch N] [--limit N] [--after <jobId>] [--dry-run] [--force]
//
// --batch    jobs recomputed per batch (1-500, default 100).
// --limit    stop after this many jobs (default: every job with a key-less row).
// --after    resume from this job id (exclusive); the script prints the cursor it stopped at.
// --dry-run  recompute and count, write nothing.
// --force    also recompute rows that already have a key (an engine change, not a backfill).
//
// How it can run offline: `decideEligibility` is pure, `job_enrichment.output` holds the full
// validated model output the verdict was built from, and `jobs.raw_text` feeds the rules pass, so
// the engine re-runs with no network. It runs through `postOf` and `rulesOf` exported from
// `enrich/enrich-job.ts` — the same functions enrichment itself uses, not a copy — so the input to
// the engine cannot drift from the input enrichment gave it.
//
// **Fidelity is verified, not assumed.** A recomputed verdict is only written when its rendered
// English `reason` is byte-identical to the one already stored for that (job, country, way). That
// string is the rendering of the key and its params, so an exact match means the same key with the
// same params produced the stored row; anything else (a newer ENGINE_VERSION, changed company
// evidence, a dated membership that has since moved) is counted as `changed` and left null. A null
// key is harmless — the UI falls back to the row's correct English text — while a wrong key would
// show the wrong sentence in every language.
//
// Prints ids, counts and milliseconds. Never post text, a reason string or a quote.
import { ENGINE_VERSION, TARGET_COUNTRIES, decideEligibility, llmToSignals } from "@pemby/core";
import { jobEnrichmentOutputSchema, type EngineVerdict } from "@pemby/core";
import { createDb, type Db } from "@pemby/db";
import { sql } from "drizzle-orm";

import { ENRICH_WAYS, loadCompanyEvidence, postOf, rulesOf } from "../enrich";

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0) return undefined;
  const value = process.argv[index + 1];
  if (value === undefined || value.startsWith("--")) {
    console.error(`--${name} needs a value`);
    process.exit(2);
  }
  return value;
}

function intArg(name: string, fallback: number, min: number, max: number): number {
  const raw = flag(name);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    console.error(`--${name} must be an integer from ${min} to ${max}`);
    process.exit(2);
  }
  return value;
}

const batchSize = intArg("batch", 100, 1, 500);
const limit = intArg("limit", Number.MAX_SAFE_INTEGER, 1, 10_000_000);
const after = flag("after") ?? null;
const dryRun = process.argv.includes("--dry-run");
const force = process.argv.includes("--force");

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

type JobRow = {
  id: string;
  company_id: string;
  company_name: string;
  url: string;
  title: string;
  locations: string[] | null;
  workplace_type: string | null;
  employment_type: string | null;
  raw_text: string;
  content_hash: string;
  enrichment_hash: string;
  model: string;
  output: unknown;
};

type ElRow = {
  job_id: string;
  scope: string;
  way_of_working: string;
  reason: string;
  reason_key: string | null;
};

const toDbWay = (way: string) => way.replace(/-/g, "_");

/** The next batch of jobs that still have at least one row to fill, ordered by id for the keyset. */
async function selectJobs(db: Db, cursor: string | null, size: number): Promise<JobRow[]> {
  const keyless = force
    ? sql``
    : sql`and exists (
        select 1 from job_eligibility el
         where el.job_id = j.id and el.reason_key is null
      )`;
  const result = await db.execute<JobRow>(sql`
    select
      j.id, j.company_id, j.url, j.title, j.locations, j.workplace_type, j.employment_type,
      j.raw_text, j.content_hash,
      c.name as company_name,
      e.content_hash as enrichment_hash, e.model, e.output
    from jobs j
    join job_enrichment e on e.job_id = j.id
    join companies c on c.id = j.company_id
    where ${cursor === null ? sql`true` : sql`j.id > ${cursor}::uuid`}
      and exists (select 1 from job_eligibility el where el.job_id = j.id)
      ${keyless}
    order by j.id
    limit ${size}
  `);
  return result.rows;
}

async function selectEligibility(db: Db, jobIds: readonly string[]): Promise<ElRow[]> {
  if (jobIds.length === 0) return [];
  const result = await db.execute<ElRow>(sql`
    select el.job_id, el.scope, el.way_of_working::text as way_of_working, el.reason, el.reason_key
    from job_eligibility el
    where el.job_id = any(${sql.param([...jobIds])}::uuid[])
  `);
  return result.rows;
}

interface Update {
  jobId: string;
  scope: string;
  wayOfWorking: string;
  reasonKey: string;
  reasonParams: string;
}

/**
 * One statement per batch. `unnest` of five parallel arrays rather than a VALUES list, so the batch
 * size does not change the statement's shape or its bind-parameter count.
 */
async function applyUpdates(db: Db, updates: readonly Update[]): Promise<number> {
  if (updates.length === 0) return 0;
  const guard = force ? sql`` : sql`and el.reason_key is null`;
  const result = await db.execute<{ job_id: string }>(sql`
    update job_eligibility el
       set reason_key = v.reason_key,
           reason_params = v.reason_params::jsonb,
           updated_at = now()
      from (
        select * from unnest(
          ${sql.param(updates.map((u) => u.jobId))}::uuid[],
          ${sql.param(updates.map((u) => u.scope))}::text[],
          ${sql.param(updates.map((u) => u.wayOfWorking))}::way_of_working[],
          ${sql.param(updates.map((u) => u.reasonKey))}::text[],
          ${sql.param(updates.map((u) => u.reasonParams))}::text[]
        ) as t(job_id, scope, way_of_working, reason_key, reason_params)
      ) v
     where el.job_id = v.job_id
       and el.scope = v.scope
       and el.way_of_working = v.way_of_working
       ${guard}
    returning el.job_id
  `);
  return result.rows.length;
}

const db = createDb(url, { max: 2, application_name: "pemby-backfill-reasons" });

const totals = {
  jobs: 0,
  /** Rows the recompute reproduced exactly: key and params written. */
  filled: 0,
  /** Rows whose recomputed English differs from the stored English: left null on purpose. */
  changed: 0,
  /** Stored rows the recompute produced no verdict for at all (country or way no longer decided). */
  missing: 0,
  /** Rows already carrying a key (only seen with --force). */
  alreadyKeyed: 0,
  /** Jobs skipped: the enrichment no longer matches the job text, or its output no longer parses. */
  staleEnrichment: 0,
  unparsableOutput: 0,
};

const started = Date.now();
let cursor = after;
let exitCode = 0;

try {
  const companyEvidence = new Map<string, Awaited<ReturnType<typeof loadCompanyEvidence>>>();
  const now = new Date();

  while (totals.jobs < limit) {
    const size = Math.min(batchSize, limit - totals.jobs);
    const jobs = await selectJobs(db, cursor, size);
    if (jobs.length === 0) break;
    cursor = jobs[jobs.length - 1]!.id;

    const rowsByJob = new Map<string, ElRow[]>();
    for (const row of await selectEligibility(
      db,
      jobs.map((j) => j.id),
    )) {
      const list = rowsByJob.get(row.job_id) ?? [];
      list.push(row);
      rowsByJob.set(row.job_id, list);
    }

    const updates: Update[] = [];
    for (const job of jobs) {
      totals.jobs += 1;
      const stored = rowsByJob.get(job.id) ?? [];
      if (job.enrichment_hash !== job.content_hash) {
        // The post changed since it was enriched, so the stored output describes different text and
        // the engine cannot be re-run faithfully. The enrich sweep re-enriches these anyway.
        totals.staleEnrichment += 1;
        continue;
      }
      const parsed = jobEnrichmentOutputSchema.safeParse(job.output);
      if (!parsed.success) {
        totals.unparsableOutput += 1;
        continue;
      }

      let company = companyEvidence.get(job.company_id);
      if (!company) {
        company = await loadCompanyEvidence(db, job.company_id);
        companyEvidence.set(job.company_id, company);
      }

      const text = {
        title: job.title,
        companyName: job.company_name,
        locations: job.locations ?? [],
        workplaceType: job.workplace_type,
        employmentType: job.employment_type,
        rawText: job.raw_text,
      };
      const post = postOf(text);
      const llm = llmToSignals(parsed.data, post);
      const verdicts: EngineVerdict[] = decideEligibility({
        rules: rulesOf(text),
        llm: { signals: llm.signals, model: job.model },
        company,
        countries: TARGET_COUNTRIES,
        ways: ENRICH_WAYS,
        postUrl: job.url,
        now,
      });

      const byKey = new Map<string, EngineVerdict>();
      for (const v of verdicts) byKey.set(`${v.country} ${toDbWay(v.wayOfWorking)}`, v);

      for (const row of stored) {
        if (row.reason_key !== null && !force) {
          totals.alreadyKeyed += 1;
          continue;
        }
        const verdict = byKey.get(`${row.scope} ${row.way_of_working}`);
        if (!verdict) {
          totals.missing += 1;
          continue;
        }
        // The fidelity check. `reason` is the rendering of (reasonKey, reasonParams), so equality
        // here means the recompute reproduced this exact row.
        if (verdict.reason !== row.reason) {
          totals.changed += 1;
          continue;
        }
        updates.push({
          jobId: row.job_id,
          scope: row.scope,
          wayOfWorking: row.way_of_working,
          reasonKey: verdict.reasonKey,
          reasonParams: JSON.stringify(verdict.reasonParams),
        });
      }
    }

    const written = dryRun ? updates.length : await applyUpdates(db, updates);
    totals.filled += written;
    console.log(
      `batch jobs=${jobs.length} filled=${written} changed=${totals.changed} missing=${totals.missing} cursor=${cursor}`,
    );
    if (jobs.length < size) break;
  }

  console.log(
    `\nbackfill:reasons engine=${ENGINE_VERSION} dryRun=${dryRun} force=${force}\n` +
      `  jobs=${totals.jobs} filled=${totals.filled} changed=${totals.changed} missing=${totals.missing}\n` +
      `  alreadyKeyed=${totals.alreadyKeyed} staleEnrichment=${totals.staleEnrichment} unparsableOutput=${totals.unparsableOutput}\n` +
      `  cursor=${cursor ?? "-"} ms=${Date.now() - started}\n` +
      `  no model call was made: the engine ran offline from job_enrichment.output`,
  );
} catch (error) {
  exitCode = 1;
  console.error(
    `backfill:reasons failed: ${error instanceof Error ? `${error.name}: ${error.message}` : "error"}`,
  );
} finally {
  await db.$client.end().catch(() => undefined);
}
process.exit(exitCode);
