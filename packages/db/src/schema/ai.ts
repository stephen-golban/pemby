import { index, integer, numeric, pgTable, text } from "drizzle-orm/pg-core";
import { createdAt, id } from "./_shared";
import { user } from "./auth";
import { aiTask, keyClass } from "./enums";

/**
 * Cost ledger for every model call; the $3/day cap sums this (PLAN D18). One row per
 * `@pemby/ai` AiUsageEntry.
 */
export const aiUsage = pgTable(
  "ai_usage",
  {
    id: id(),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    task: aiTask("task").notNull(),
    model: text("model").notNull(),
    keyClass: keyClass("key_class").notNull(),
    /** `PromptTemplate.versionId` from the private config; null for prompt-less tasks. */
    promptVersion: text("prompt_version"),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    costUsd: numeric("cost_usd", { precision: 12, scale: 6 }).notNull().default("0"),
    /** OpenRouter generation id, for reconciliation. */
    generationId: text("generation_id"),
    createdAt: createdAt(),
  },
  (t) => [
    index("ai_usage_created_idx").on(t.createdAt),
    index("ai_usage_user_task_created_idx").on(t.userId, t.task, t.createdAt),
  ],
);
