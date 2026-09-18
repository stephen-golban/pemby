// One `embed.job` run: build the job's embedding text, skip when its hash is unchanged, otherwise
// one embedding request and an upsert into `job_embeddings`.
//
// Privacy: the text here is a public job post, but the module still never logs it. The caller logs
// the job id, character and token counts, cost and milliseconds.
import { EMBEDDING_MODEL, runEmbeddingTask, type CostLedger, type DailyCapGuard } from "@pemby/ai";
import { schema, type Db } from "@pemby/db";
import { eq } from "drizzle-orm";

import { assertEmbedBudget } from "./budget";
import { buildJobEmbeddingText, embeddingContentHash } from "./text";

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
  if (text === "") return { kind: "skipped", reason: "no-signal" };
  const contentHash = embeddingContentHash(text);

  const [existing] = await db
    .select({ contentHash: jobEmbeddings.contentHash, model: jobEmbeddings.model })
    .from(jobEmbeddings)
    .where(eq(jobEmbeddings.jobId, jobId))
    .limit(1);
  if (existing && existing.contentHash === contentHash && existing.model === EMBEDDING_MODEL) {
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
    .values({ jobId, model: EMBEDDING_MODEL, contentHash, embedding })
    .onConflictDoUpdate({
      target: jobEmbeddings.jobId,
      set: { model: EMBEDDING_MODEL, contentHash, embedding, updatedAt: new Date() },
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
