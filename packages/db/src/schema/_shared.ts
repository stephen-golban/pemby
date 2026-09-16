import { EMBEDDING_DIMENSIONS } from "@pemby/core";
import { sql } from "drizzle-orm";
import { halfvec, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Primary key for Pemby-owned tables. Postgres 18 ships `uuidv7()` natively; v7 ids are
 * time-ordered, which keeps btree inserts local. Better Auth tables keep their own text ids.
 */
export const id = () =>
  uuid("id")
    .primaryKey()
    .default(sql`uuidv7()`);

export const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).defaultNow().notNull();

export const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date());

export const timestamps = () => ({ createdAt: createdAt(), updatedAt: updatedAt() });

/**
 * Embedding model and dimension (PLAN D19) come from `@pemby/core`, shared with `@pemby/ai`,
 * which requests exactly EMBEDDING_DIMENSIONS from OpenRouter. pgvector HNSW indexes cap `vector`
 * at 2000 dims and `halfvec` at 4000, so 2048-d `halfvec` is indexable at half the storage.
 * Changing either value needs a migration and a re-embed.
 */
export { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL } from "@pemby/core";

export const embedding = () => halfvec("embedding", { dimensions: EMBEDDING_DIMENSIONS }).notNull();
