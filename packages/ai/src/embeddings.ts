// One embedding task for a routed embedding model: explicit batching, the daily cap checked before
// every request, one `ai_usage` row per request, and vectors returned in input order.
//
// Why this is not `runStructuredTask`: `prepareRun` refuses a route whose kind is not "language"
// (structured.ts), and the JSON-schema, repair-retry and fallback machinery has no meaning for an
// embedding endpoint, which either returns vectors or fails.
//
// Why batching is explicit: `OpenRouterEmbeddingModel.maxEmbeddingsPerCall` is `undefined` and
// `supportsParallelCalls` is true, so `embedMany` (ai 7.0.101) puts *every* value into one request:
// it splits only when the model declares a per-call limit. Chunking here keeps one request inside
// the model's context window and keeps every `ai_usage` row equal to exactly one request.
//
// Privacy: nothing here logs, and no value ever reaches an error message, an error `cause` or a
// result field. `profile-embedding` values are CV-derived personal data; the errors thrown carry the
// task, the model, an HTTP status and OpenRouter's `error_type` only, exactly like `structured.ts`.
import { embedMany } from "ai";
import { EMBEDDING_DIMENSIONS, type AiTask } from "@pemby/core";

import {
  DailyCapReachedError,
  countsTowardDailyCap,
  type CostLedger,
  type DailyCapGuard,
} from "./cost";
import type { EnvLike, KeyClass } from "./keys";
import { embeddingModelForTask, loadRoutingTable, type RoutingTable } from "./routing";
import { AiCallError, describeFailure, isConfigError, throwIfAborted } from "./structured";
import { estimateAttemptCost, estimateCostUsd, lookupGenerationUsage } from "./usage";

/** Per request. Embedding requests are short; 60 s is already far above a normal answer. */
const DEFAULT_TIMEOUT_MS = 60_000;

/**
 * Values per request.
 *
 * `qwen/qwen3-embedding-8b` publishes no maximum batch size, so the binding limit is the context
 * window: its OpenRouter endpoints advertise 32,000 tokens (Nebius) and 32,768 (DeepInfra,
 * SiliconFlow) — `GET https://openrouter.ai/api/v1/models/qwen/qwen3-embedding-8b/endpoints`, read
 * 2026-09-17. 16 values capped at EMBEDDING_MAX_REQUEST_CHARS in total is ~24,000 tokens at the
 * ~4 characters per token this package already estimates with, so a full batch stays inside the
 * smallest window even if a provider charges the whole request against it. Both are overridable per
 * call; both are enforced, so whichever limit a batch reaches first ends it.
 */
export const EMBEDDING_BATCH_SIZE = 16;
export const EMBEDDING_MAX_REQUEST_CHARS = 96_000;
/**
 * Longest single value accepted. ~5,000 tokens: far inside the window on its own, and a value above
 * it is a caller that forgot to cap its text, which is worth failing before a request is billed.
 */
export const EMBEDDING_MAX_VALUE_CHARS = 20_000;

export interface EmbeddingTaskContext {
  userId?: string | null;
  jobId?: string | null;
  companyId?: string | null;
  /** Run tag stored in `ai_usage.run_label`, e.g. `backfill`, `sweep`. */
  runLabel?: string | null;
}

export interface EmbeddingTaskOptions {
  /** Must resolve to a route of kind "embedding" (`job-embedding`, `profile-embedding`). */
  task: AiTask;
  /** Embedded in one or more requests; the result keeps this order. */
  values: readonly string[];
  ledger: CostLedger;
  /** Checked before every request for Pemby-paid keys; skipped for "user". */
  capGuard: DailyCapGuard;
  context?: EmbeddingTaskContext;
  /** Defaults to `loadRoutingTable()` (private `routing.json`, else DEFAULT_ROUTING). */
  table?: RoutingTable;
  /** "user" with `userApiKey` for a user's own key; otherwise the table's key class. */
  keyClass?: KeyClass;
  userApiKey?: string;
  env?: EnvLike;
  /** Per request. Default 60 s. */
  timeoutMs?: number;
  /**
   * Cancels the task. Combined with the per-request timeout. An aborted request still writes its
   * `ai_usage` row (estimated cost), then the signal's reason (or an AbortError) is thrown.
   */
  abortSignal?: AbortSignal;
  /** For the generation-cost lookup; defaults to globalThis.fetch. */
  fetch?: typeof globalThis.fetch;
  now?: () => Date;
  /** Default EMBEDDING_BATCH_SIZE. */
  batchSize?: number;
  /** Default EMBEDDING_MAX_REQUEST_CHARS. */
  maxCharsPerRequest?: number;
  /** Default EMBEDDING_MAX_VALUE_CHARS. */
  maxValueChars?: number;
}

export interface EmbeddingTaskResult {
  /** One vector per input value, in input order, each EMBEDDING_DIMENSIONS long. */
  embeddings: number[][];
  task: AiTask;
  /**
   * The model id OpenRouter reported for the last request, as the upstream provider spells it. The
   * `ai_usage` rows keep the routed id (see the record call) — use this only for logging.
   */
  model: string;
  keyClass: KeyClass;
  /** The last request's generation id; `generationIds` has one entry per request. */
  generationId: string | null;
  generationIds: (string | null)[];
  /** Requests sent. */
  requests: number;
  /** One entry: an embedding route has no fallback models. Same field as StructuredTaskResult. */
  attemptedModels: string[];
  /** Sum over every request, from OpenRouter's `usage.cost` where it reported one. */
  costUsd: number;
  /** True when any request's cost had to be estimated from the price table. */
  costEstimated: boolean;
  /**
   * The embedding response reports one total token count, with no input/output split (there is no
   * output side), so the total goes in `inputTokens` and `outputTokens` is always 0.
   */
  inputTokens: number;
  outputTokens: 0;
  latencyMs: number;
  /** The upstream provider OpenRouter routed the last request to, when it reported one. */
  provider: string | null;
}

/**
 * A value, or what came back for it, did not fit the contract. Carries counts and an index only,
 * never a value: for `profile-embedding` the values are personal data.
 */
export class AiEmbeddingInvalidError extends Error {
  readonly task: AiTask;
  readonly model: string;
  readonly reason: "value-too-long" | "count" | "dimensions";
  /** Index into the task's `values`, or null when the problem is the whole request. */
  readonly index: number | null;
  readonly expected: number;
  readonly received: number;

  constructor(
    task: AiTask,
    model: string,
    reason: "value-too-long" | "count" | "dimensions",
    index: number | null,
    expected: number,
    received: number,
  ) {
    super(
      `[ai] Task "${task}" on ${model}: ${reason} (expected ${expected}, got ${received}` +
        `${index === null ? "" : ` at value ${index}`}).`,
    );
    this.name = "AiEmbeddingInvalidError";
    this.task = task;
    this.model = model;
    this.reason = reason;
    this.index = index;
    this.expected = expected;
    this.received = received;
  }
}

interface Indexed {
  index: number;
  value: string;
}

/**
 * Splits values into requests bounded by both the value count and the total characters. A value is
 * never split; one that alone exceeds `maxChars` is rejected earlier by `maxValueChars`.
 */
export function chunkEmbeddingValues(
  values: readonly string[],
  batchSize: number,
  maxChars: number,
): Indexed[][] {
  const chunks: Indexed[][] = [];
  let current: Indexed[] = [];
  let chars = 0;
  values.forEach((value, index) => {
    if (current.length > 0 && (current.length >= batchSize || chars + value.length > maxChars)) {
      chunks.push(current);
      current = [];
      chars = 0;
    }
    current.push({ index, value });
    chars += value.length;
  });
  if (current.length > 0) chunks.push(current);
  return chunks;
}

/**
 * Embeds `values` with the task's routed embedding model. Throws `DailyCapReachedError` (before the
 * request it would have sent; earlier requests keep their rows), the caller's abort reason,
 * `AiCallError` (a request failed), `AiEmbeddingInvalidError` (a value too long, or a response with
 * the wrong number or size of vectors), or `AiConfigError`/`PersonalDataRoutingError`.
 */
export async function runEmbeddingTask(
  options: EmbeddingTaskOptions,
): Promise<EmbeddingTaskResult> {
  const { task, values, ledger, capGuard, context = {} } = options;
  const now = options.now ?? (() => new Date());
  const table = options.table ?? (await loadRoutingTable());
  const keyOptions = {
    ...(options.userApiKey === undefined ? {} : { userApiKey: options.userApiKey }),
    ...(options.env === undefined ? {} : { env: options.env }),
  };
  // Also the kind guard: `embeddingModelForTask` throws for a language route.
  const { model, route } = embeddingModelForTask(task, {
    table,
    ...(options.keyClass === undefined ? {} : { keyClass: options.keyClass }),
    ...keyOptions,
  });

  const batchSize = options.batchSize ?? EMBEDDING_BATCH_SIZE;
  const maxChars = options.maxCharsPerRequest ?? EMBEDDING_MAX_REQUEST_CHARS;
  const maxValueChars = Math.min(options.maxValueChars ?? EMBEDDING_MAX_VALUE_CHARS, maxChars);
  values.forEach((value, index) => {
    if (value.length > maxValueChars) {
      throw new AiEmbeddingInvalidError(
        task,
        route.model,
        "value-too-long",
        index,
        maxValueChars,
        value.length,
      );
    }
  });

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const callerSignal = options.abortSignal;
  const attemptedModels = [route.model];
  const started = performance.now();

  const embeddings: number[][] = new Array<number[]>(values.length);
  const generationIds: (string | null)[] = [];
  let requests = 0;
  let totalCost = 0;
  let totalTokens = 0;
  let costEstimated = false;
  let answeredModel = route.model;
  let provider: string | null = null;

  const record = (fields: {
    model: string;
    outcome: "ok" | "error";
    inputTokens: number;
    costUsd: number;
    costEstimated: boolean;
    generationId: string | null;
    latencyMs: number;
  }) => {
    totalCost += fields.costUsd;
    return ledger.record({
      userId: context.userId ?? null,
      task,
      keyClass: route.keyClass,
      // Embedding routes have `promptName: null`: there is no prompt and no version to record.
      promptVersion: null,
      createdAt: now(),
      attemptedModels: [...attemptedModels],
      jobId: context.jobId ?? null,
      companyId: context.companyId ?? null,
      runLabel: context.runLabel ?? null,
      // The embedding response carries one total token count and no output side (see the result
      // doc): the total is recorded as input tokens and the output count is always 0.
      outputTokens: 0,
      ...fields,
    });
  };

  // Checked before every request, exactly as `structured.ts` does it, so a long batch stops as soon
  // as the day's spend reaches the cap. Nothing has been sent when this throws.
  const checkCap = async () => {
    if (!countsTowardDailyCap(route.keyClass)) return;
    const at = now();
    const status = await capGuard.check(at);
    if (status.state === "capped") throw new DailyCapReachedError(status, at);
  };

  for (const chunk of chunkEmbeddingValues(values, batchSize, maxChars)) {
    throwIfAborted(callerSignal);
    await checkCap();
    requests += 1;
    const t0 = performance.now();
    const timeout = AbortSignal.timeout(timeoutMs);
    const chunkChars = chunk.reduce((n, item) => n + item.value.length, 0);

    let result;
    try {
      result = await embedMany({
        model,
        values: chunk.map((item) => item.value),
        maxRetries: 0,
        // One request per chunk: the chunking above is the only splitting that happens.
        maxParallelCalls: 1,
        abortSignal: callerSignal ? AbortSignal.any([callerSignal, timeout]) : timeout,
      });
    } catch (error) {
      const config = isConfigError(error);
      if (config) throw config;
      const failure = describeFailure(error);
      const aborted = callerSignal?.aborted === true;
      // No HTTP response (timeout, abort, dropped connection): the request may still be billed and
      // there is no generation id to look up, so record an upper-bound estimate. `0` output tokens,
      // not the default, because an embedding request has no output side.
      const estimate =
        failure.status === null ? estimateAttemptCost(route.model, chunkChars, 0) : null;
      await record({
        model: route.model,
        outcome: "error",
        inputTokens: estimate?.inputTokens ?? 0,
        costUsd: estimate?.costUsd ?? 0,
        costEstimated: estimate !== null,
        generationId: null,
        latencyMs: Math.round(performance.now() - t0),
      });
      if (aborted) throwIfAborted(callerSignal);
      throw new AiCallError(task, route.model, failure, attemptedModels);
    }

    // The provider returns the parsed OpenRouter body: `{ id?, model, provider?, usage? }`.
    const body = result.responses?.[0]?.body as
      { id?: unknown; model?: unknown; provider?: unknown } | undefined;
    const generationId = typeof body?.id === "string" && body.id !== "" ? body.id : null;
    if (typeof body?.model === "string" && body.model !== "") answeredModel = body.model;
    if (typeof body?.provider === "string" && body.provider !== "") provider = body.provider;
    generationIds.push(generationId);

    const usage = (
      result.providerMetadata?.openrouter as { usage?: { cost?: unknown } } | undefined
    )?.usage;
    let inputTokens = Number.isFinite(result.usage.tokens) ? result.usage.tokens : 0;
    let costUsd = typeof usage?.cost === "number" ? usage.cost : null;
    let estimated = false;
    if (costUsd === null && generationId !== null) {
      const looked = await lookupGenerationUsage(generationId, route.keyClass, {
        ...keyOptions,
        ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
      });
      if (looked) {
        costUsd = looked.costUsd;
        // Only the input count: the generation's completion count is 0 for an embedding.
        inputTokens = looked.inputTokens ?? inputTokens;
      }
    }
    if (costUsd === null) {
      costUsd = estimateCostUsd(route.model, inputTokens, 0);
      estimated = true;
      costEstimated = true;
    }
    totalTokens += inputTokens;

    // Written before the vectors are checked: the request was billed either way. The row keeps the
    // *routed* model id, not the id in the response: an embedding route has no fallback models, so
    // there is only ever one model it could have been, and OpenRouter echoes the upstream
    // provider's own casing ("Qwen/Qwen3-Embedding-8B"), which would not join against the price
    // table, the routing table or `job_embeddings.model`. The answered id is in the result instead.
    await record({
      model: route.model,
      outcome: "ok",
      inputTokens,
      costUsd,
      costEstimated: estimated,
      generationId,
      latencyMs: Math.round(performance.now() - t0),
    });

    if (result.embeddings.length !== chunk.length) {
      throw new AiEmbeddingInvalidError(
        task,
        answeredModel,
        "count",
        null,
        chunk.length,
        result.embeddings.length,
      );
    }
    chunk.forEach((item, position) => {
      const vector = result.embeddings[position] ?? [];
      if (vector.length !== EMBEDDING_DIMENSIONS) {
        throw new AiEmbeddingInvalidError(
          task,
          answeredModel,
          "dimensions",
          item.index,
          EMBEDDING_DIMENSIONS,
          vector.length,
        );
      }
      embeddings[item.index] = vector;
    });
  }

  return {
    embeddings,
    task,
    model: answeredModel,
    keyClass: route.keyClass,
    generationId: generationIds[generationIds.length - 1] ?? null,
    generationIds,
    requests,
    attemptedModels: [...attemptedModels],
    costUsd: totalCost,
    costEstimated,
    inputTokens: totalTokens,
    outputTokens: 0,
    latencyMs: Math.round(performance.now() - started),
    provider,
  };
}
