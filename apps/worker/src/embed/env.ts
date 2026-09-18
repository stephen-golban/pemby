// Embedding knobs from the environment. Names are listed in .env.example by the integration order.
//
// EMBED_ENABLED             "true" registers the sweep schedule; anything else removes it
//                           (default off, like ENRICH_ENABLED).
// EMBED_SWEEP_LIMIT         jobs enqueued per sweep (every 15 minutes), default 50, 1 to 500.
//                           50 a sweep is 4,800 a day: a full backfill of staging's ~2,900 enriched
//                           jobs finishes inside a day without a manual run.
// EMBED_PROFILE_SWEEP_LIMIT profiles enqueued per sweep, default 20, 1 to 200. Separate from the
//                           job limit because a profile embedding is personal data on the ZDR key
//                           and there are orders of magnitude fewer of them.
// EMBED_CONCURRENCY         embed.job handlers per process, default 2, 1 to 8. embed.profile always
//                           runs one at a time.
// EMBED_DAILY_BUDGET_USD    per-day ceiling on embedding spend under the global AI cap, default
//                           0.25, above 0 and at most AI_DAILY_CAP_USD's ceiling. Shaped like
//                           CV_PARSE_DAILY_BUDGET_USD: a backfill must not be able to starve
//                           enrichment or CV parsing.
import { DAILY_CAP_USD } from "@pemby/ai";

export interface EmbedEnv {
  enabled: boolean;
  sweepLimit: number;
  profileSweepLimit: number;
  concurrency: number;
  budgetUsd: number;
}

type EnvLike = Record<string, string | undefined>;

export const EMBED_DAILY_BUDGET_DEFAULT_USD = 0.25;

function int(env: EnvLike, name: string, fallback: number, min: number, max: number): number {
  const raw = env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer from ${min} to ${max}`);
  }
  return value;
}

/** Reads EMBED_DAILY_BUDGET_USD; throws on a value outside (0, DAILY_CAP_USD]. */
export function readEmbedBudgetUsd(env: EnvLike = process.env): number {
  const raw = env.EMBED_DAILY_BUDGET_USD?.trim();
  if (!raw) return EMBED_DAILY_BUDGET_DEFAULT_USD;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0 || value > DAILY_CAP_USD) {
    throw new Error(`EMBED_DAILY_BUDGET_USD must be a number above 0 and at most ${DAILY_CAP_USD}`);
  }
  return value;
}

export function readEmbedEnv(env: EnvLike = process.env): EmbedEnv {
  const enabled = env.EMBED_ENABLED?.trim().toLowerCase();
  if (enabled && !["true", "false", "1", "0"].includes(enabled)) {
    throw new Error("EMBED_ENABLED must be true or false");
  }
  return {
    enabled: enabled === "true" || enabled === "1",
    sweepLimit: int(env, "EMBED_SWEEP_LIMIT", 50, 1, 500),
    profileSweepLimit: int(env, "EMBED_PROFILE_SWEEP_LIMIT", 20, 1, 200),
    concurrency: int(env, "EMBED_CONCURRENCY", 2, 1, 8),
    budgetUsd: readEmbedBudgetUsd(env),
  };
}
