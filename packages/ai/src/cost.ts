// Cost ledger and the daily spend cap (PLAN D18). The Postgres ledger is `createAiUsageLedger(db)`
// in `@pemby/db`, which implements `CostLedger` structurally; the row shape lives in `@pemby/core`.
import type { AiUsageRecord } from "@pemby/core";

import { AiConfigError, type EnvLike, type KeyClass } from "./keys";

/** Hard cap on Pemby-paid AI spend per UTC day. */
export const DAILY_CAP_USD = 3;

/** One row of `ai_usage`: one per attempt that reached OpenRouter. */
export type AiUsageEntry = AiUsageRecord;

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
  readonly capUsd: number;
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

/**
 * `AI_DAILY_CAP_USD`, default DAILY_CAP_USD ($3). It may lower the cap (0 caps everything, for the
 * cap test) but never raise it. Staging and production use the same OpenRouter keys but each sums
 * only its own database's `ai_usage`, so their caps add up: with both at the default, the keys can
 * spend 2 x $3 a day. Set `AI_DAILY_CAP_USD=1` on staging to keep the combined cap at $4.
 */
export function readDailyCapUsd(env: EnvLike = process.env): number {
  const raw = env.AI_DAILY_CAP_USD?.trim();
  if (!raw) return DAILY_CAP_USD;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > DAILY_CAP_USD) {
    throw new AiConfigError(`AI_DAILY_CAP_USD must be a number from 0 to ${DAILY_CAP_USD}.`);
  }
  return value;
}

/** `YYYY-MM-DD` of the UTC day containing `at`. */
export function utcDay(at: Date): string {
  return at.toISOString().slice(0, 10);
}

/** 00:00 UTC after `at`: when a capped day's queued work may run. */
export function nextUtcMidnight(at: Date): Date {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate() + 1));
}

/** Thrown before any request when the day's Pemby-paid spend has reached the cap. Nothing was sent. */
export class DailyCapReachedError extends Error {
  readonly day: string;
  readonly spentUsd: number;
  readonly capUsd: number;
  /** Retry the queued job at or after this time (next 00:00 UTC). */
  readonly retryAt: Date;

  constructor(status: { spentUsd: number; capUsd: number }, at: Date) {
    super(
      `[ai] Daily AI cap reached: $${status.spentUsd.toFixed(4)} of $${status.capUsd.toFixed(2)} ` +
        `on ${utcDay(at)} UTC; retry after 00:00 UTC.`,
    );
    this.name = "DailyCapReachedError";
    this.day = utcDay(at);
    this.spentUsd = status.spentUsd;
    this.capUsd = status.capUsd;
    this.retryAt = nextUtcMidnight(at);
  }
}

export interface DailyCapGuardOptions {
  ledger: Pick<CostLedger, "spentOnDayUsd">;
  /** Defaults to `readDailyCapUsd(process.env)`. */
  capUsd?: number;
  now?: () => Date;
}

export function createDailyCapGuard({
  ledger,
  capUsd = readDailyCapUsd(),
  now = () => new Date(),
}: DailyCapGuardOptions): DailyCapGuard {
  return {
    capUsd,
    async check(at = now()) {
      return evaluateDailyCap(await ledger.spentOnDayUsd(at), capUsd);
    },
  };
}
