// Postgres side of the AI cost ledger (PLAN D18): `@pemby/ai` records every model call here and
// checks the daily cap against it. Structurally implements `CostLedger` from `@pemby/ai`, which this
// package must not import; the row shape (`AiUsageRecord`) lives in `@pemby/core`.
import type { AiCallOutcome, AiTask, AiUsageRecord, KeyClass } from "@pemby/core";
import { and, desc, eq, gte, inArray, isNull, lt, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import type { Db } from "../client";
import { aiCapAlerts, aiUsage } from "../schema";
import type { AiCapAlertChannel } from "../schema";

export interface AiUsageLedger {
  record(entry: AiUsageRecord): Promise<void>;
  /** Pemby-paid spend (public and private keys) for the UTC day containing `at`. */
  spentOnDayUsd(at: Date): Promise<number>;
}

/** Bounds of the UTC day containing `at`, computed in SQL so `ai_usage_created_idx` serves the range. */
function utcDayBounds(at: Date): { start: SQL; end: SQL } {
  const ts = at.toISOString();
  return {
    start: sql`(date_trunc('day', ${ts}::timestamptz at time zone 'UTC') at time zone 'UTC')`,
    end: sql`((date_trunc('day', ${ts}::timestamptz at time zone 'UTC') + interval '1 day') at time zone 'UTC')`,
  };
}

export function createAiUsageLedger(db: Db): AiUsageLedger {
  return {
    async record(entry) {
      await db.insert(aiUsage).values({
        userId: entry.userId,
        task: entry.task,
        model: entry.model,
        keyClass: entry.keyClass,
        promptVersion: entry.promptVersion,
        inputTokens: entry.inputTokens,
        outputTokens: entry.outputTokens,
        costUsd: entry.costUsd.toFixed(6),
        costEstimated: entry.costEstimated ?? false,
        generationId: entry.generationId ?? null,
        latencyMs: entry.latencyMs == null ? null : Math.round(entry.latencyMs),
        outcome: entry.outcome ?? "ok",
        attemptedModels: [...(entry.attemptedModels ?? [])],
        jobId: entry.jobId ?? null,
        companyId: entry.companyId ?? null,
        runLabel: entry.runLabel ?? null,
        createdAt: entry.createdAt,
      });
    },

    async spentOnDayUsd(at) {
      const { start, end } = utcDayBounds(at);
      const [row] = await db
        .select({ spent: sql<string>`coalesce(sum(${aiUsage.costUsd}), 0)` })
        .from(aiUsage)
        .where(
          and(
            gte(aiUsage.createdAt, start),
            lt(aiUsage.createdAt, end),
            inArray(aiUsage.keyClass, ["public", "private"]),
          ),
        );
      return Number(row?.spent ?? 0);
    },
  };
}

export interface CapAlertClaim {
  /** The UTC day; a Date is reduced to its UTC `YYYY-MM-DD`. */
  day: Date | string;
  spentUsd: number;
  capUsd: number;
  /** Planned channel. */
  channel: AiCapAlertChannel;
}

/** An undelivered claim older than this may be claimed again (the sender likely crashed). */
const CAP_ALERT_RECLAIM_AFTER = sql`interval '15 minutes'`;

function utcDay(day: Date | string): string {
  return typeof day === "string" ? day : day.toISOString().slice(0, 10);
}

/**
 * Claim the day's cap alert. True when this call inserted the day's row, or re-claimed a row that
 * is still undelivered 15 minutes after its last claim (then `sent_at` moves to now and `attempts`
 * goes up by one). One statement, so concurrent callers cannot both win.
 */
export async function claimCapAlert(db: Db, claim: CapAlertClaim): Promise<boolean> {
  const claimed = await db
    .insert(aiCapAlerts)
    .values({
      day: utcDay(claim.day),
      spentUsd: claim.spentUsd,
      capUsd: claim.capUsd,
      channel: claim.channel,
    })
    .onConflictDoUpdate({
      target: aiCapAlerts.day,
      set: {
        sentAt: sql`now()`,
        attempts: sql`${aiCapAlerts.attempts} + 1`,
        spentUsd: sql`excluded.spent_usd`,
        channel: sql`excluded.channel`,
      },
      setWhere: and(
        isNull(aiCapAlerts.deliveredVia),
        lt(aiCapAlerts.sentAt, sql`now() - ${CAP_ALERT_RECLAIM_AFTER}`),
      ),
    })
    .returning({ day: aiCapAlerts.day });
  return claimed.length > 0;
}

export interface CapAlertDelivery {
  /** The UTC day; a Date is reduced to its UTC `YYYY-MM-DD`. */
  day: Date | string;
  deliveredVia: AiCapAlertChannel;
}

/** Record that the day's alert went out; later claims for the day return false. */
export async function markCapAlertDelivered(db: Db, delivery: CapAlertDelivery): Promise<void> {
  await db
    .update(aiCapAlerts)
    .set({ deliveredVia: delivery.deliveredVia })
    .where(eq(aiCapAlerts.day, utcDay(delivery.day)));
}

export interface AiUsageTotalsRow {
  task: AiTask;
  model: string;
  keyClass: KeyClass;
  outcome: AiCallOutcome;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  /** Null when no row in the group recorded a latency. */
  avgLatencyMs: number | null;
  p95LatencyMs: number | null;
}

export interface AiUsageTotalsFilter {
  since: Date;
  /** Omitted: every row. A string: that run only. Null: only rows without a run label. */
  runLabel?: string | null;
}

/** `ai_usage` since `since`, grouped by task, model, key class and outcome; costliest first. */
export async function aiUsageTotals(
  db: Db,
  { since, runLabel }: AiUsageTotalsFilter,
): Promise<AiUsageTotalsRow[]> {
  const cost = sql`coalesce(sum(${aiUsage.costUsd}), 0)`;
  const rows = await db
    .select({
      task: aiUsage.task,
      model: aiUsage.model,
      keyClass: aiUsage.keyClass,
      outcome: aiUsage.outcome,
      calls: sql<number>`count(*)::int`,
      inputTokens: sql<string>`coalesce(sum(${aiUsage.inputTokens}), 0)::bigint`,
      outputTokens: sql<string>`coalesce(sum(${aiUsage.outputTokens}), 0)::bigint`,
      costUsd: sql<string>`${cost}`,
      avgLatencyMs: sql<string | null>`avg(${aiUsage.latencyMs})`,
      p95LatencyMs: sql<
        number | null
      >`percentile_cont(0.95) within group (order by ${aiUsage.latencyMs})`,
    })
    .from(aiUsage)
    .where(
      and(
        gte(aiUsage.createdAt, since),
        runLabel === undefined
          ? undefined
          : runLabel === null
            ? isNull(aiUsage.runLabel)
            : eq(aiUsage.runLabel, runLabel),
      ),
    )
    .groupBy(aiUsage.task, aiUsage.model, aiUsage.keyClass, aiUsage.outcome)
    .orderBy(desc(cost), aiUsage.task, aiUsage.model);

  return rows.map((r) => ({
    ...r,
    calls: Number(r.calls),
    inputTokens: Number(r.inputTokens),
    outputTokens: Number(r.outputTokens),
    costUsd: Number(r.costUsd),
    avgLatencyMs: r.avgLatencyMs == null ? null : Math.round(Number(r.avgLatencyMs)),
    p95LatencyMs: r.p95LatencyMs == null ? null : Math.round(Number(r.p95LatencyMs)),
  }));
}
