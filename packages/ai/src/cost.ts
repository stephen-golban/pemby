// Cost ledger and the daily spend cap (PLAN D18). Interfaces only: the Postgres-backed
// implementation lands with `@pemby/db` (ai_usage table, PLAN section 3).
import type { KeyClass } from "./keys";
import type { AiTask } from "./routing";

/** Hard cap on Pemby-paid AI spend per UTC day. */
export const DAILY_CAP_USD = 3;

/** One row of `ai_usage`. */
export interface AiUsageEntry {
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
}

export interface CostLedger {
  record(entry: AiUsageEntry): Promise<void>;
  /** Pemby-paid spend (public and private keys) for the UTC day containing `at`. */
  spentOnDayUsd(at: Date): Promise<number>;
}

export type DailyCapStatus =
  | { state: "open"; spentUsd: number; remainingUsd: number; capUsd: number }
  | { state: "capped"; spentUsd: number; capUsd: number };

/** Before a Pemby-paid call: when capped, the caller queues the work and alerts the owner. */
export interface DailyCapGuard {
  check(at?: Date): Promise<DailyCapStatus>;
}

/** Spend on the user's own key is theirs and never counts toward Pemby's cap. */
export function countsTowardDailyCap(keyClass: KeyClass): boolean {
  return keyClass !== "user";
}

export function evaluateDailyCap(spentUsd: number, capUsd: number = DAILY_CAP_USD): DailyCapStatus {
  return spentUsd >= capUsd
    ? { state: "capped", spentUsd, capUsd }
    : { state: "open", spentUsd, remainingUsd: capUsd - spentUsd, capUsd };
}
