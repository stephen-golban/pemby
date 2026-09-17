// One `cv.parse` run for one cv_files row: claim, stream the `cv-parse` task, write partials, then
// write the result and pre-fill the profile in one transaction. Also sets `queued` (AI cap) and
// `failed` states. Queue side effects (resend, alert, retry) belong to the caller.
//
// `parsed_partial` is set to null on success: it is only a preview while `parse_status = 'parsing'`,
// and the status route reads `parsed` once the row is parsed, so keeping a copy would only double
// the personal data stored.
//
// Privacy: never logs or returns CV text, partials or parsed fields. Callers log ids, statuses,
// counts, ms, cost.
import {
  AiCallError,
  AiOutputInvalidError,
  DAILY_CAP_USD,
  DailyCapReachedError,
  loadPrompt,
  runStreamingStructuredTask,
  type CostLedger,
  type DailyCapGuard,
} from "@pemby/ai";
import { ParsedProfileSchema, normalizeParsedProfile, type ParsedProfile } from "@pemby/core";
import { schema, type Db } from "@pemby/db";
import { and, eq, gte, inArray, sql } from "drizzle-orm";

import { createPartialWriter } from "./partial-writer";
import { fillProfileFromCv } from "./profile";

const { aiUsage, cvFiles, user } = schema;

type CvStageTimings = NonNullable<(typeof cvFiles.$inferSelect)["stageTimings"]>;

export const CV_PARSE_ERROR_CODE = "parse_failed";

/**
 * Lowest `cv-parse` prompt version this job will call a model with. The private repo shipped a
 * 0.1.0 stub ("Stub prompt, not in use"), and a worker whose PRIVATE_CONFIG_REF still resolves to it
 * asks the model for the profile schema with no instructions: every answer fails validation, after
 * three billed attempts. Below this version the job fails the row without calling the model.
 */
export const MIN_CV_PARSE_PROMPT_VERSION = "0.2.0";

/** False only for a version we can read as numeric and that is below the minimum. */
export function isUsableCvParsePromptVersion(
  version: string,
  minimum: string = MIN_CV_PARSE_PROMPT_VERSION,
): boolean {
  const parts = (v: string) => v.split(".").map((n) => Number(n));
  const actual = parts(version);
  const min = parts(minimum);
  if (actual.length === 0 || actual.some((n) => !Number.isInteger(n))) return true;
  for (let i = 0; i < min.length; i++) {
    const a = actual[i] ?? 0;
    const m = min[i] ?? 0;
    if (a !== m) return a > m;
  }
  return true;
}

/**
 * Per-day ceiling on `cv-parse` spend, under the global AI cap: anonymous uploads are open to the
 * internet, so one attacker must not be able to spend the whole day's budget and starve enrichment.
 * `CV_PARSE_DAILY_BUDGET_USD`, default 1.00, at most the global cap.
 */
export const CV_PARSE_DAILY_BUDGET_DEFAULT_USD = 1;

export function readCvParseBudgetUsd(
  env: Record<string, string | undefined> = process.env,
): number {
  const raw = env.CV_PARSE_DAILY_BUDGET_USD?.trim();
  if (!raw) return CV_PARSE_DAILY_BUDGET_DEFAULT_USD;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0 || value > DAILY_CAP_USD) {
    throw new Error(`CV_PARSE_DAILY_BUDGET_USD must be a number from 0 to ${DAILY_CAP_USD}`);
  }
  return value;
}

/** Today's (UTC) `cv-parse` spend. Uses the `(task, created_at)` index on `ai_usage`. */
export async function cvParseSpentTodayUsd(db: Db, at: Date = new Date()): Promise<number> {
  const dayStart = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
  const [row] = await db
    .select({ total: sql<string>`coalesce(sum(${aiUsage.costUsd}), 0)` })
    .from(aiUsage)
    .where(and(eq(aiUsage.task, "cv-parse"), gte(aiUsage.createdAt, dayStart)));
  return Number(row?.total ?? 0);
}

// Control characters a model can emit inside a string: Postgres rejects U+0000 in jsonb and text,
// and a driver error quotes its parameters, which are the parsed profile. Newline and tab stay.
// Written as a scan, not a regex, because a control-character class is a lint error here.
function stripControlChars(value: string): string {
  let out = "";
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0;
    const control = (code < 0x20 && code !== 0x09 && code !== 0x0a) || code === 0x7f;
    if (!control) out += ch;
  }
  return out;
}

function stripControls<T>(value: T): T {
  if (typeof value === "string") return stripControlChars(value) as T;
  if (Array.isArray(value)) return value.map(stripControls) as T;
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, stripControls(v)]),
    ) as T;
  }
  return value;
}

/** Normalized profile with every control character removed from every string. */
export function sanitizeParsedProfile(profile: ParsedProfile): ParsedProfile {
  return stripControls(profile);
}

export interface CvParseDeps {
  db: Db;
  ledger: CostLedger;
  capGuard: DailyCapGuard;
  /** Defaults to `readCvParseBudgetUsd(process.env)`. */
  budgetUsd?: number;
}

export interface CvParseAttempt {
  signal?: AbortSignal;
  /**
   * Whether a failure that may be transient (AiCallError: every model failed on network, HTTP or
   * timeout) may be retried by the queue. When false, the row is marked `failed` instead.
   */
  mayRetry: boolean;
}

export interface CvParseMetrics {
  ms: number;
  firstPartialMs: number | null;
  partialWrites: number;
  streamed: boolean | null;
  costUsd: number | null;
  model: string | null;
  attempts: number | null;
}

export type CvParseOutcome =
  | { kind: "skipped"; reason: "not-found" | "not-parsable" }
  | { kind: "parsed"; metrics: CvParseMetrics; profileFilled: string[]; written: boolean }
  | { kind: "queued"; metrics: CvParseMetrics; error: DailyCapReachedError }
  | { kind: "failed"; metrics: CvParseMetrics; reason: string }
  | { kind: "retry"; metrics: CvParseMetrics; error: unknown };

const mergeTimings = (timings: CvStageTimings) =>
  sql`coalesce(${cvFiles.stageTimings}, '{}'::jsonb) || ${JSON.stringify(timings)}::jsonb`;

export const CV_PARSE_TIMEOUT_CODE = "parse_timeout";

async function markFailed(
  db: Db,
  cvId: string,
  errorCode: string = CV_PARSE_ERROR_CODE,
  /** Recorded on the failed row so a bad prompt or model is visible without the logs. */
  attempted: { promptVersion?: string; model?: string } = {},
) {
  await db
    .update(cvFiles)
    .set({
      parseStatus: "failed",
      errorCode,
      parsedPartial: null,
      ...(attempted.promptVersion === undefined
        ? {}
        : { parsePromptVersion: attempted.promptVersion }),
      ...(attempted.model === undefined ? {} : { parseModel: attempted.model }),
    })
    .where(and(eq(cvFiles.id, cvId), inArray(cvFiles.parseStatus, ["parsing", "queued"])));
}

/** Marks the row failed after the queue gave up (unexpected error, or expiry with `parse_timeout`). */
export function markCvParseFailed(db: Db, cvId: string, errorCode?: string): Promise<void> {
  return markFailed(db, cvId, errorCode);
}

/**
 * Fails rows stuck in `parsing` (a worker died, or the job expired on its last attempt): started
 * more than `olderThanMinutes` ago (default 10) by `stage_timings.parseStartedAt`, or by
 * `updated_at` when the parse never recorded a start. Sets `error_code = 'parse_timeout'`.
 * Returns the number of rows failed.
 */
export async function failStaleCvParses(
  db: Db,
  opts: { olderThanMinutes?: number } = {},
): Promise<number> {
  const minutes = opts.olderThanMinutes ?? 10;
  const rows = await db
    .update(cvFiles)
    .set({ parseStatus: "failed", errorCode: CV_PARSE_TIMEOUT_CODE, parsedPartial: null })
    .where(
      and(
        eq(cvFiles.parseStatus, "parsing"),
        sql`coalesce((${cvFiles.stageTimings}->>'parseStartedAt')::timestamptz, ${cvFiles.updatedAt}) < now() - make_interval(mins => ${minutes})`,
      ),
    )
    .returning({ id: cvFiles.id });
  return rows.length;
}

export async function parseCv(
  deps: CvParseDeps,
  cvId: string,
  attempt: CvParseAttempt,
): Promise<CvParseOutcome> {
  const { db } = deps;
  const started = Date.now();

  // Claim: only `parsing` (first delivery, or a retry) and `queued` (after the cap) run. A
  // re-delivery for a parsed, failed or deleted row is a no-op.
  const [row] = await db
    .update(cvFiles)
    .set({
      parseStatus: "parsing",
      queuedUntil: null,
      errorCode: null,
      stageTimings: mergeTimings({ parseStartedAt: new Date(started).toISOString() }),
    })
    .where(and(eq(cvFiles.id, cvId), inArray(cvFiles.parseStatus, ["parsing", "queued"])))
    .returning({ userId: cvFiles.userId, text: cvFiles.extractedText });
  if (!row) {
    const [exists] = await db
      .select({ id: cvFiles.id })
      .from(cvFiles)
      .where(eq(cvFiles.id, cvId))
      .limit(1);
    return { kind: "skipped", reason: exists ? "not-parsable" : "not-found" };
  }

  const writer = createPartialWriter(db, cvId);
  const metrics = (
    result: { streamed: boolean; costUsd: number; model: string; attempts: number } | null,
  ): CvParseMetrics => ({
    ms: Date.now() - started,
    firstPartialMs: writer.stats.firstPartialAt
      ? writer.stats.firstPartialAt.getTime() - started
      : null,
    partialWrites: writer.stats.writes,
    streamed: result?.streamed ?? null,
    costUsd: result?.costUsd ?? null,
    model: result?.model ?? null,
    attempts: result?.attempts ?? null,
  });

  if (row.text === null || row.text.trim() === "") {
    await markFailed(db, cvId);
    return { kind: "failed", metrics: metrics(null), reason: "no-text" };
  }

  /** Status `queued` until 00:00 UTC; the caller alerts and resends. */
  const toQueued = async (error: DailyCapReachedError): Promise<CvParseOutcome> => {
    await db
      .update(cvFiles)
      .set({ parseStatus: "queued", queuedUntil: error.retryAt, parsedPartial: null })
      .where(and(eq(cvFiles.id, cvId), eq(cvFiles.parseStatus, "parsing")));
    return { kind: "queued", metrics: metrics(null), error };
  };

  // The prompt this run would use. Loading it here (it is cached for the process) also records its
  // version on a failed row, which is what tells a stale config apart from a bad CV.
  const prompt = await loadPrompt("cv-parse");
  if (!isUsableCvParsePromptVersion(prompt.version)) {
    await writer.close();
    await markFailed(db, cvId, CV_PARSE_ERROR_CODE, { promptVersion: prompt.versionId });
    return {
      kind: "failed",
      metrics: metrics(null),
      reason: `prompt-too-old:${prompt.version}`,
    };
  }

  // The CV sub-budget, checked like the global cap: nothing has been sent yet.
  const at = new Date();
  const budgetUsd = deps.budgetUsd ?? readCvParseBudgetUsd();
  const spentUsd = await cvParseSpentTodayUsd(db, at);
  if (spentUsd >= budgetUsd) {
    await writer.close();
    return toQueued(new DailyCapReachedError({ spentUsd, capUsd: budgetUsd }, at));
  }

  let result;
  try {
    result = await runStreamingStructuredTask({
      task: "cv-parse",
      schema: ParsedProfileSchema,
      prompt,
      schemaName: "parsed_profile",
      input: row.text,
      ledger: deps.ledger,
      capGuard: deps.capGuard,
      context: { userId: row.userId },
      ...(attempt.signal ? { abortSignal: attempt.signal } : {}),
      onPartial: (partial) => writer.push(partial),
    });
  } catch (error) {
    await writer.close();
    if (error instanceof DailyCapReachedError) return toQueued(error);
    if (error instanceof AiOutputInvalidError) {
      // The chain already made a repair retry on the same model; the same text fails again.
      await markFailed(db, cvId, CV_PARSE_ERROR_CODE, {
        promptVersion: prompt.versionId,
        model: error.model,
      });
      return { kind: "failed", metrics: metrics(null), reason: error.name };
    }
    if (error instanceof AiCallError && !attempt.mayRetry) {
      await markFailed(db, cvId, CV_PARSE_ERROR_CODE, { promptVersion: prompt.versionId });
      return { kind: "failed", metrics: metrics(null), reason: error.name };
    }
    // AiCallError with a retry left, an abort, a prompt or config error, a database error: the row
    // stays `parsing` and the queue decides.
    return { kind: "retry", metrics: metrics(null), error };
  }
  await writer.close();

  const parsed = sanitizeParsedProfile(normalizeParsedProfile(result.data));
  const parsedAt = new Date();
  const outcome = await db.transaction(async (tx) => {
    const nothing = { written: false, profileFilled: [] as string[] };
    // Lock order, always user before cv_files: the claim above updates cv_files, which takes a
    // share lock on its user row, so taking these in the other order could deadlock with it.
    const [seen] = await tx
      .select({ userId: cvFiles.userId })
      .from(cvFiles)
      .where(eq(cvFiles.id, cvId));
    if (!seen) return nothing;
    await tx.select({ id: user.id }).from(user).where(eq(user.id, seen.userId)).for("update");
    const [current] = await tx
      .select({ userId: cvFiles.userId, status: cvFiles.parseStatus })
      .from(cvFiles)
      .where(eq(cvFiles.id, cvId))
      .for("update");
    // Gone (cleanup, replaced) or no longer ours to write.
    if (!current || current.status !== "parsing") return nothing;
    if (current.userId !== seen.userId) {
      // A claim re-parented the row while we read it: lock the new owner too, in the same order.
      await tx.select({ id: user.id }).from(user).where(eq(user.id, current.userId)).for("update");
    }
    await tx
      .update(cvFiles)
      .set({
        parsed,
        parsedPartial: null,
        parseModel: result.model,
        parsePromptVersion: result.promptVersion,
        parsedAt,
        parseStatus: "parsed",
        errorCode: null,
        stageTimings: mergeTimings({ parsedAt: parsedAt.toISOString() }),
      })
      .where(eq(cvFiles.id, cvId));
    return { written: true, profileFilled: await fillProfileFromCv(tx, current.userId, parsed) };
  });

  return { kind: "parsed", metrics: metrics(result), ...outcome };
}
