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
] as const;
export type AiTask = (typeof AI_TASKS)[number];

/**
 * Which key paid for or processed an AI call (PLAN D17). Also the values of the `key_class`
 * Postgres enum.
 */
export const KEY_CLASSES = ["public", "private", "user"] as const;
export type KeyClass = (typeof KEY_CLASSES)[number];

/**
 * Embedding model and dimension (PLAN D19). `qwen/qwen3-embedding-8b` is natively 4096-d and
 * trained with Matryoshka representation learning; `@pemby/ai` requests `dimensions` =
 * EMBEDDING_DIMENSIONS from OpenRouter, which returns normalised vectors of that size. pgvector
 * HNSW indexes cap `vector` at 2000 dims and `halfvec` at 4000, so `@pemby/db` stores 2048-d
 * `halfvec`. Changing either value needs a migration and a re-embed.
 */
export const EMBEDDING_MODEL = "qwen/qwen3-embedding-8b";
export const EMBEDDING_DIMENSIONS = 2048;
