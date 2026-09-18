// One `embed.job` run: build the job's embedding text, skip when its hash is unchanged, otherwise
// one embedding request and an upsert into `job_embeddings`.
//
// Either way the run records what it judged against — the recipe generation and the post's
// `jobs.content_hash` in `source_key`, and the database clock reading it judged at in `checked_at` —
// so `selectJobsToEmbed` stops offering a row it has already settled. A skip that wrote nothing is
// what made the sweep livelock (migration 0011).
//
// Privacy: the text here is a public job post, but the module still never logs it. The caller logs
// the job id, character and token counts, cost and milliseconds.
import { EMBEDDING_MODEL, runEmbeddingTask, type CostLedger, type DailyCapGuard } from "@pemby/ai";
import { schema, type Db } from "@pemby/db";
import { eq, sql } from "drizzle-orm";

import { assertEmbedBudget } from "./budget";
import { EMBED_TEXT_VERSION, buildJobEmbeddingText, embeddingContentHash } from "./text";

const { jobEmbeddings, jobEnrichment, jobs } = schema;

export interface EmbedDeps {
  db: Db;
  ledger: CostLedger;
  capGuard: DailyCapGuard;
  /** Per-day embedding ceiling under the global cap. */
  budgetUsd: number;
  /** `ai_usage.run_label`, e.g. `sweep` or `backfill`. */
  runLabel?: string | null;
  abortSignal?: AbortSignal;
}

export type EmbedOutcome =
  | { kind: "skipped"; reason: "not-found" | "not-enriched" | "no-signal" }
  /** The stored hash already matches the text this run built: no model call was made. */
  | { kind: "unchanged" }
  | {
      kind: "embedded";
      chars: number;
      inputTokens: number;
      costUsd: number;
      model: string;
      requests: number;
      latencyMs: number;
    };

/**
 * Records that this run confirmed the vector against the sources it read.
 *
 * This is the write `selectJobsToEmbed` reads back, and it is the whole fix: a run that decides the
 * text has not changed has still learned something, and the sweep asks the same question again on
 * the next tick unless the answer is stored.
 *
 * Two deliberate details:
 *
 *  - Raw SQL, not `db.update(jobEmbeddings)`. `updatedAt` carries drizzle's `$onUpdate`, so any
 *    builder update would stamp `updated_at = now()` as a side effect, and `match/sweep.ts` reads
 *    that column as "the vector changed". Confirming a vector must not look like replacing one.
 *  - `checkedAt` is the database's own clock (`now()`, read below), not `new Date()`. It is
 *    compared with `<`, so an early value only ever buys one more free re-check, while a Node clock
 *    running ahead of the database's would settle a row against enrichment that had not happened
 *    yet. It stays a string all the way back: the driver hands a raw `now()` back as text, and
 *    drizzle's `timestamp` mapper calls `.toISOString()` on whatever it is given, so it must not be
 *    routed through a column mapper. Hence the `::timestamptz` cast here and in the upsert.
 *
 * Affects no rows when the job has no vector yet, which is correct: there is nothing to confirm.
 */
async function recordJobChecked(
  db: Db,
  jobId: string,
  sourceKey: string,
  checkedAt: string,
): Promise<void> {
  await db.execute(sql`
    update job_embeddings
       set source_key = ${sourceKey},
           checked_at = ${checkedAt}::timestamptz
     where job_id = ${jobId}
  `);
}

/**
 * The `source_key` a confirmed job vector carries: recipe generation, a colon, then the post hash.
 * `selectJobsToEmbed` builds the same string in SQL — the two must agree, so change them together.
 */
function jobSourceKey(jobContentHash: string): string {
  return `${EMBED_TEXT_VERSION}:${jobContentHash}`;
}

/**
 * Embeds one job. Throws `DailyCapReachedError` (global cap or the embed sub-budget; nothing was
 * sent), `AiCallError`, `AiEmbeddingInvalidError`, the caller's abort reason, or a database error.
 */
export async function embedJob(deps: EmbedDeps, jobId: string): Promise<EmbedOutcome> {
  const { db } = deps;
  const [row] = await db
    .select({
      title: jobs.title,
      rawText: jobs.rawText,
      jobRoleFamily: jobs.roleFamily,
      // The post fingerprint this run is about to judge against, and the database's clock reading
      // from before it was read. Both are written back if the run confirms the vector.
      jobContentHash: jobs.contentHash,
      checkedAt: sql<string>`now()`,
      enrichedJobId: jobEnrichment.jobId,
      roleFamily: jobEnrichment.roleFamily,
      seniority: jobEnrichment.seniority,
      yearsMin: jobEnrichment.yearsMin,
      stack: jobEnrichment.stack,
      domains: jobEnrichment.domains,
    })
    .from(jobs)
    .leftJoin(jobEnrichment, eq(jobEnrichment.jobId, jobs.id))
    .where(eq(jobs.id, jobId))
    .limit(1);
  if (!row) return { kind: "skipped", reason: "not-found" };
  // Matching compares a job vector with a profile vector built from the same five fields, so a job
  // with no enrichment has nothing to compare on and is left for the enrichment sweep.
  if (row.enrichedJobId === null) return { kind: "skipped", reason: "not-enriched" };

  const text = buildJobEmbeddingText({
    title: row.title,
    roleFamily: row.roleFamily ?? row.jobRoleFamily,
    seniority: row.seniority,
    yearsMin: row.yearsMin,
    stack: row.stack ?? [],
    domains: row.domains ?? [],
    postText: row.rawText,
  });
  if (text === "") {
    // Nothing embeddable, and nothing about that will change until a source does. Record the state
    // anyway so a job in this shape that already has a vector is not re-examined on every tick.
    await recordJobChecked(db, jobId, jobSourceKey(row.jobContentHash), row.checkedAt);
    return { kind: "skipped", reason: "no-signal" };
  }
  const contentHash = embeddingContentHash(text);

  const [existing] = await db
    .select({ contentHash: jobEmbeddings.contentHash, model: jobEmbeddings.model })
    .from(jobEmbeddings)
    .where(eq(jobEmbeddings.jobId, jobId))
    .limit(1);
  if (existing && existing.contentHash === contentHash && existing.model === EMBEDDING_MODEL) {
    // The paid call is correctly skipped; the bookkeeping is what was missing. Without this write
    // the row stays a candidate for ever and crowds out jobs that have no vector at all.
    await recordJobChecked(db, jobId, jobSourceKey(row.jobContentHash), row.checkedAt);
    return { kind: "unchanged" };
  }

  await assertEmbedBudget(db, deps.budgetUsd);
  const result = await runEmbeddingTask({
    task: "job-embedding",
    values: [text],
    ledger: deps.ledger,
    capGuard: deps.capGuard,
    context: { jobId, runLabel: deps.runLabel ?? null },
    ...(deps.abortSignal ? { abortSignal: deps.abortSignal } : {}),
  });
  const embedding = result.embeddings[0];
  if (!embedding) return { kind: "skipped", reason: "no-signal" };

  // `model` is the routed id, which `validateRoutingTable` pins to the one the `halfvec` columns
  // were built for; the skip above compares against the same constant.
  await db
    .insert(jobEmbeddings)
    .values({
      jobId,
      model: EMBEDDING_MODEL,
      contentHash,
      embedding,
      sourceKey: jobSourceKey(row.jobContentHash),
      checkedAt: sql`${row.checkedAt}::timestamptz`,
    })
    .onConflictDoUpdate({
      target: jobEmbeddings.jobId,
      set: {
        model: EMBEDDING_MODEL,
        contentHash,
        embedding,
        sourceKey: jobSourceKey(row.jobContentHash),
        checkedAt: sql`${row.checkedAt}::timestamptz`,
        updatedAt: new Date(),
      },
    });

  return {
    kind: "embedded",
    chars: text.length,
    inputTokens: result.inputTokens,
    costUsd: result.costUsd,
    model: result.model,
    requests: result.requests,
    latencyMs: result.latencyMs,
  };
}
