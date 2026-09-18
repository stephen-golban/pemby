// The embedding sub-budget: a per-UTC-day ceiling on `job-embedding` plus `profile-embedding` spend
// that sits under the global AI cap, shaped exactly like `CV_PARSE_DAILY_BUDGET_USD`
// (apps/worker/src/cv/parse/parse-cv.ts). A backfill walks thousands of rows in a row, so without
// its own ceiling it could spend the whole day's budget and starve enrichment and CV parsing.
//
// It is checked like the cap: before anything is sent, and it raises the same
// `DailyCapReachedError`, so every caller's cap branch (alert, re-send with `startAfter`) already
// handles it.
import { DailyCapReachedError } from "@pemby/ai";
import { schema, type Db } from "@pemby/db";
import { and, gte, inArray, sql } from "drizzle-orm";

const { aiUsage } = schema;

/** Today's (UTC) embedding spend, both tasks. Uses the `(task, created_at)` index on `ai_usage`. */
export async function embedSpentTodayUsd(db: Db, at: Date = new Date()): Promise<number> {
  const dayStart = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
  const [row] = await db
    .select({ total: sql<string>`coalesce(sum(${aiUsage.costUsd}), 0)` })
    .from(aiUsage)
    .where(
      and(
        inArray(aiUsage.task, ["job-embedding", "profile-embedding"]),
        gte(aiUsage.createdAt, dayStart),
      ),
    );
  return Number(row?.total ?? 0);
}

/** Throws `DailyCapReachedError` when today's embedding spend has reached `budgetUsd`. */
export async function assertEmbedBudget(
  db: Db,
  budgetUsd: number,
  at: Date = new Date(),
): Promise<void> {
  const spentUsd = await embedSpentTodayUsd(db, at);
  if (spentUsd >= budgetUsd) {
    throw new DailyCapReachedError({ spentUsd, capUsd: budgetUsd }, at);
  }
}
