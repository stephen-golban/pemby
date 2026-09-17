// Names shared by `@pemby/ai` (routing, cost ledger) and `@pemby/db` (enums, vector columns).
// They live here because `@pemby/ai` must not import `@pemby/db` and neither may import the other
// for these; both depend on `@pemby/core`. Isomorphic: constants only.

/** Every routed AI task (PLAN D19). Also the values of the `ai_task` Postgres enum. */
export const AI_TASKS = [
  "job-enrichment",
  "cv-parse",
  "job-embedding",
  "profile-embedding",
  "application-kit",
  /** Hiring-country evidence from a company's public careers pages (public key). */
  "company-evidence",
] as const;
export type AiTask = (typeof AI_TASKS)[number];

/**
 * Which key paid for or processed an AI call (PLAN D17). Also the values of the `key_class`
 * Postgres enum.
 */
export const KEY_CLASSES = ["public", "private", "user"] as const;
export type KeyClass = (typeof KEY_CLASSES)[number];

/**
 * How a model call ended, stored in `ai_usage.outcome`:
 * - `ok`: the first response was valid;
 * - `repaired`: valid after one repair retry;
 * - `invalid`: the schema was still invalid after the repair retry;
 * - `error`: the call failed (HTTP, timeout, every fallback model exhausted).
 */
export const AI_CALL_OUTCOMES = ["ok", "repaired", "invalid", "error"] as const;
export type AiCallOutcome = (typeof AI_CALL_OUTCOMES)[number];

/**
 * One row of `ai_usage` (one per attempt: each fallback model and repair retry) as the cost ledger
 * records it. `@pemby/ai`'s `AiUsageEntry` must stay
 * assignable to this; `@pemby/db`'s ledger accepts it. The optional fields default in the database.
 */
export interface AiUsageRecord {
  userId: string | null;
  task: AiTask;
  model: string;
  keyClass: KeyClass;
  /** `PromptTemplate.versionId` from the private config, or null for prompt-less tasks. */
  promptVersion: string | null;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  createdAt: Date;
  /** True when `costUsd` is an estimate (e.g. a timed-out attempt with no usage in a response). */
  costEstimated?: boolean;
  /** OpenRouter generation id, for reconciliation. */
  generationId?: string | null;
  latencyMs?: number | null;
  /** Defaults to `ok`. */
  outcome?: AiCallOutcome;
  /** Every model tried, in order, including the one that answered. Defaults to empty. */
  attemptedModels?: readonly string[];
  jobId?: string | null;
  companyId?: string | null;
  /** Free-form run tag, e.g. `eval:gpt-oss-120b`, `backfill`, `sample`. */
  runLabel?: string | null;
}

/**
 * Embedding model and dimension (PLAN D19). `qwen/qwen3-embedding-8b` is natively 4096-d and
 * trained with Matryoshka representation learning; `@pemby/ai` requests `dimensions` =
 * EMBEDDING_DIMENSIONS from OpenRouter, which returns normalised vectors of that size. pgvector
 * HNSW indexes cap `vector` at 2000 dims and `halfvec` at 4000, so `@pemby/db` stores 2048-d
 * `halfvec`. Changing either value needs a migration and a re-embed.
 */
export const EMBEDDING_MODEL = "qwen/qwen3-embedding-8b";
export const EMBEDDING_DIMENSIONS = 2048;
