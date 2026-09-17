// One structured model call for a routed task: JSON-schema output, zod validation, one repair
// retry, client-side fallback across the route's models, and one `ai_usage` row per attempt.
//
// Why fallbacks run here and not through OpenRouter `models`: OpenRouter bills and reports only the
// model that finally answered, so a server-side chain hides which model failed and why. Walking the
// chain here gives each attempt its own row (status, latency, cost), lets the repair retry stay on
// the model that produced the invalid output, and lets `routeOverride` pin one model for the eval.
// OpenRouter still fails over between providers of the same model (`provider.allow_fallbacks`).
//
// Privacy: nothing here logs. Errors thrown to callers carry task, model, HTTP status and
// OpenRouter's `error_type` only: never prompt text, input, model output, `requestBodyValues` or
// `responseBody`, and never the original SDK error as `cause`.
import { APICallError, generateText, type ModelMessage } from "ai";
import type { AiCallOutcome, AiTask } from "@pemby/core";
import { loadPrompt, type PromptTemplate, type TaskParams } from "@pemby/core/private-config";
import { z } from "zod";

import {
  DailyCapReachedError,
  countsTowardDailyCap,
  type CostLedger,
  type DailyCapGuard,
} from "./cost";
import { AiConfigError, getOpenRouter, type EnvLike, type KeyClass } from "./keys";
import { loadRoutingTable, resolveRoute, type ResolvedRoute, type RoutingTable } from "./routing";
import {
  estimateAttemptCost,
  estimateCostUsd,
  lookupGenerationUsage,
  type CostEstimate,
} from "./usage";

type OpenRouterCallOptions = NonNullable<
  Parameters<typeof generateText>[0]["providerOptions"]
>[string];

const DEFAULT_TIMEOUT_MS = 90_000;
const MAX_ISSUES_IN_REPAIR = 10;

export interface StructuredTaskContext {
  userId?: string | null;
  jobId?: string | null;
  companyId?: string | null;
  /** Run tag stored in `ai_usage.run_label`, e.g. `eval:gpt-oss-120b`, `backfill`, `sample`. */
  runLabel?: string | null;
}

/** Forces one model with no fallback, e.g. for the eval. The key class never changes. */
export interface RouteOverride {
  model: string;
  /** Replaces the route's params; omitted keeps them. */
  params?: TaskParams;
}

export interface StructuredTaskOptions<T> {
  task: AiTask;
  /** Validates the parsed output. Its JSON Schema (z.toJSONSchema) is sent as `response_format`. */
  schema: z.ZodType<T>;
  /** `json_schema.name`; defaults to the task name. */
  schemaName?: string;
  /** Sent as the instructions. Defaults to `loadPrompt(route.promptName)` from the private config. */
  prompt?: PromptTemplate;
  /** The user message, e.g. the job post text. */
  input: string;
  ledger: CostLedger;
  /** Checked before every request (first, repair, each fallback) for Pemby-paid keys; skipped for "user". */
  capGuard: DailyCapGuard;
  context?: StructuredTaskContext;
  routeOverride?: RouteOverride;
  /** Defaults to `loadRoutingTable()` (private `routing.json`, else DEFAULT_ROUTING). */
  table?: RoutingTable;
  /** "user" with `userApiKey` for a user's own key; otherwise the table's key class. */
  keyClass?: KeyClass;
  userApiKey?: string;
  env?: EnvLike;
  /** Per attempt. Default 90 s. */
  timeoutMs?: number;
  /**
   * Cancels the task, e.g. pg-boss `job.signal` or a shutdown signal. Combined with the per-attempt
   * timeout. An aborted attempt still writes its `ai_usage` row (estimated cost), then the signal's
   * reason (or an AbortError) is thrown; no further model is tried.
   */
  abortSignal?: AbortSignal;
  /** For the generation-cost lookup; defaults to globalThis.fetch. */
  fetch?: typeof globalThis.fetch;
  /** `json_schema.strict`. Default true: every property required, no extra keys. */
  strict?: boolean;
  now?: () => Date;
}

export interface StructuredTaskResult<T> {
  data: T;
  task: AiTask;
  /** The model OpenRouter reports as having answered. */
  model: string;
  keyClass: KeyClass;
  generationId: string | null;
  outcome: Extract<AiCallOutcome, "ok" | "repaired">;
  promptVersion: string;
  /** Requests sent, repair retry included. */
  attempts: number;
  attemptedModels: string[];
  /** Sum over every attempt, from OpenRouter's `usage.cost`. */
  costUsd: number;
  latencyMs: number;
}

/** Every model in the chain failed. Carries no request or response content. */
export class AiCallError extends Error {
  readonly task: AiTask;
  readonly model: string;
  /** HTTP status, or null for timeouts and network failures. */
  readonly status: number | null;
  /** OpenRouter `error.metadata.error_type` when present, `timeout`, or `network`. */
  readonly errorType: string | null;
  readonly attemptedModels: readonly string[];

  constructor(task: AiTask, model: string, failure: Failure, attemptedModels: readonly string[]) {
    const status = failure.status === null ? "no status" : `HTTP ${failure.status}`;
    const type = failure.errorType === null ? "" : ` ${failure.errorType}`;
    super(
      `[ai] Task "${task}" failed on ${model} (${status}${type}); tried ${attemptedModels.length} model(s).`,
    );
    this.name = "AiCallError";
    this.task = task;
    this.model = model;
    this.status = failure.status;
    this.errorType = failure.errorType;
    this.attemptedModels = [...attemptedModels];
  }
}

/** The output still failed the schema after the one repair retry. */
export class AiOutputInvalidError extends Error {
  readonly task: AiTask;
  readonly model: string;
  readonly issueCount: number;
  /**
   * Dot-joined zod issue paths (e.g. "verdicts.0.tier"), up to MAX_ISSUES_IN_REPAIR, in the order
   * zod reported them. Paths only: zod's `message` can quote the received value, which may carry
   * job-post or model-output content, so never included here.
   */
  readonly issuePaths: readonly string[];

  constructor(task: AiTask, model: string, issueCount: number, issuePaths: readonly string[] = []) {
    super(
      `[ai] Task "${task}" on ${model} returned output that failed the schema after one repair retry (${issueCount} issue(s)${issuePaths.length > 0 ? `: ${issuePaths.join(", ")}` : ""}).`,
    );
    this.name = "AiOutputInvalidError";
    this.task = task;
    this.model = model;
    this.issueCount = issueCount;
    this.issuePaths = [...issuePaths];
  }
}

/** The task's prompt is not in the private config (e.g. an optional prompt not written yet). */
export class AiPromptMissingError extends Error {
  readonly task: AiTask;
  readonly promptName: string | null;

  constructor(task: AiTask, promptName: string | null) {
    super(
      promptName === null
        ? `[ai] Task "${task}" has no prompt in its route; pass one.`
        : `[ai] Task "${task}" needs prompts/${promptName}.md in the private config, and it is missing.`,
    );
    this.name = "AiPromptMissingError";
    this.task = task;
    this.promptName = promptName;
  }
}

interface Failure {
  status: number | null;
  errorType: string | null;
}

const SAFE_TOKEN = /^[a-z][a-z0-9_]{0,63}$/;

function safeToken(value: unknown): string | null {
  return typeof value === "string" && SAFE_TOKEN.test(value) ? value : null;
}

/** Status and error type only; the rest of an SDK error can hold request or response content. */
function describeFailure(error: unknown): Failure {
  if (APICallError.isInstance(error)) {
    // Failed responses parse to `{ error: {...} }`; a 200 carrying an error passes the inner object.
    type ErrorBody = { code?: unknown; type?: unknown; metadata?: { error_type?: unknown } };
    const data = (error.data ?? {}) as ErrorBody & { error?: ErrorBody };
    const body: ErrorBody = data.error ?? data;
    const code = typeof body.code === "number" ? body.code : null;
    const status = error.statusCode === 200 && code !== null ? code : (error.statusCode ?? null);
    return {
      status,
      errorType:
        safeToken(body.metadata?.error_type) ??
        safeToken(body.type) ??
        (status === null ? "network" : null),
    };
  }
  if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
    return { status: null, errorType: "timeout" };
  }
  return { status: null, errorType: "network" };
}

function isConfigError(error: unknown): AiConfigError | null {
  if (error instanceof AiConfigError) return error;
  if (error instanceof Error && error.cause instanceof AiConfigError) return error.cause;
  return null;
}

function jsonSchemaFor(schema: z.ZodType): Record<string, unknown> {
  const { $schema: _ignored, ...rest } = z.toJSONSchema(schema) as Record<string, unknown>;
  return rest;
}

function stripFences(text: string): string {
  const match = /^\s*```(?:json)?\s*\n([\s\S]*?)\n\s*```\s*$/.exec(text);
  return (match?.[1] ?? text).trim();
}

type Validation<T> =
  { ok: true; data: T } | { ok: false; issueCount: number; issuePaths: string[]; feedback: string };

function validate<T>(schema: z.ZodType<T>, text: string): Validation<T> {
  let json: unknown;
  try {
    json = JSON.parse(stripFences(text));
  } catch {
    return {
      ok: false,
      issueCount: 1,
      issuePaths: [],
      feedback: "Your previous reply was not valid JSON.",
    };
  }
  const result = schema.safeParse(json);
  if (result.success) return { ok: true, data: result.data };
  const issues = result.error.issues.slice(0, MAX_ISSUES_IN_REPAIR);
  const issuePaths = issues.map((issue) => issue.path.join(".") || "(root)");
  const lines = issues.map((issue, i) => `- ${issuePaths[i]}: ${issue.message}`);
  return {
    ok: false,
    issueCount: result.error.issues.length,
    issuePaths,
    feedback: `Your previous reply did not match the required JSON schema:\n${lines.join("\n")}`,
  };
}

function openRouterOptions(
  params: TaskParams | undefined,
  name: string,
  schema: Record<string, unknown>,
  strict: boolean,
): OpenRouterCallOptions {
  const reasoning = params?.reasoning;
  return {
    response_format: {
      type: "json_schema",
      // z.toJSONSchema output is plain JSON.
      json_schema: { name, strict, schema: schema as OpenRouterCallOptions },
    },
    // Only providers that honour response_format (and the other parameters) may serve the call.
    // On ZDR keys, withEnforcedZdr adds zdr and data_collection to this object.
    provider: { require_parameters: true },
    ...(reasoning === undefined
      ? {}
      : {
          reasoning: {
            ...(reasoning.enabled === undefined ? {} : { enabled: reasoning.enabled }),
            ...(reasoning.effort === undefined ? {} : { effort: reasoning.effort }),
            ...(reasoning.maxTokens === undefined ? {} : { max_tokens: reasoning.maxTokens }),
            ...(reasoning.exclude === undefined ? {} : { exclude: reasoning.exclude }),
          },
        }),
  };
}

async function resolvePrompt(route: ResolvedRoute, prompt: PromptTemplate | undefined) {
  if (prompt) return prompt;
  if (route.promptName === null) throw new AiPromptMissingError(route.task, null);
  try {
    return await loadPrompt(route.promptName);
  } catch (error) {
    if (error instanceof Error && (error as { code?: unknown }).code === "not-found") {
      throw new AiPromptMissingError(route.task, route.promptName);
    }
    throw error;
  }
}

type Attempt =
  | {
      ok: true;
      text: string;
      model: string;
      generationId: string | null;
      inputTokens: number;
      outputTokens: number;
      costUsd: number;
      costEstimated: boolean;
      latencyMs: number;
    }
  | {
      ok: false;
      failure: Failure;
      /** The caller's abortSignal fired (not the per-attempt timeout). */
      aborted: boolean;
      estimate: CostEstimate | null;
      latencyMs: number;
    };

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (!signal?.aborted) return;
  const reason: unknown = signal.reason;
  throw reason instanceof Error
    ? reason
    : new DOMException("The operation was aborted.", "AbortError");
}

function contentLength(message: ModelMessage): number {
  return typeof message.content === "string" ? message.content.length : 0;
}

/**
 * Runs one structured task. Throws `DailyCapReachedError` (before the request it would have sent;
 * earlier attempts keep their rows), the caller's abort reason, `AiPromptMissingError`,
 * `AiCallError` (every model failed), `AiOutputInvalidError` (invalid after the repair retry),
 * `AiConfigError`/`PersonalDataRoutingError` (misconfiguration), or a ledger write error.
 */
export async function runStructuredTask<T>(
  options: StructuredTaskOptions<T>,
): Promise<StructuredTaskResult<T>> {
  const { task, schema, input, ledger, capGuard, context = {}, routeOverride } = options;
  const now = options.now ?? (() => new Date());
  const table = options.table ?? (await loadRoutingTable());
  const base = resolveRoute(task, {
    table,
    ...(options.keyClass === undefined ? {} : { keyClass: options.keyClass }),
  });
  if (base.kind !== "language") {
    throw new Error(`[ai] Task "${task}" is an ${base.kind} task, not language.`);
  }
  const route: ResolvedRoute = routeOverride
    ? {
        ...base,
        model: routeOverride.model,
        fallbackModels: [],
        ...(routeOverride.params === undefined ? {} : { params: routeOverride.params }),
      }
    : base;

  const prompt = await resolvePrompt(route, options.prompt);
  const keyOptions = {
    ...(options.userApiKey === undefined ? {} : { userApiKey: options.userApiKey }),
    ...(options.env === undefined ? {} : { env: options.env }),
  };

  const provider = getOpenRouter(route.keyClass, keyOptions);
  const providerOptions = openRouterOptions(
    route.params,
    options.schemaName ?? task.replace(/-/g, "_"),
    jsonSchemaFor(schema),
    options.strict ?? true,
  );
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const callerSignal = options.abortSignal;

  const attemptedModels: string[] = [];
  let attempts = 0;
  let totalCost = 0;
  const started = performance.now();

  const record = (fields: {
    model: string;
    outcome: AiCallOutcome;
    inputTokens: number;
    outputTokens: number;
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
      promptVersion: prompt.versionId,
      createdAt: now(),
      attemptedModels: [...attemptedModels],
      jobId: context.jobId ?? null,
      companyId: context.companyId ?? null,
      runLabel: context.runLabel ?? null,
      ...fields,
    });
  };

  // Checked before every request (first, repair, each fallback), so a chain stops as soon as the
  // day's spend reaches the cap. Remaining overshoot: chains running concurrently can all pass the
  // check before any of them records its spend, so the cap can be exceeded by at most
  // (concurrent chains) x (one attempt's cost). No reservations: at Pemby's concurrency and
  // per-attempt cost (well under a cent) that is a few cents.
  const checkCap = async () => {
    if (!countsTowardDailyCap(route.keyClass)) return;
    const at = now();
    const status = await capGuard.check(at);
    if (status.state === "capped") throw new DailyCapReachedError(status, at);
  };

  const call = async (model: string, messages: ModelMessage[]): Promise<Attempt> => {
    throwIfAborted(callerSignal);
    await checkCap();
    attempts += 1;
    const t0 = performance.now();
    const timeout = AbortSignal.timeout(timeoutMs);
    try {
      const result = await generateText({
        model: provider.chat(model),
        instructions: prompt.text,
        messages,
        maxRetries: 0,
        abortSignal: callerSignal ? AbortSignal.any([callerSignal, timeout]) : timeout,
        ...(route.params?.temperature === undefined
          ? {}
          : { temperature: route.params.temperature }),
        ...(route.params?.maxOutputTokens === undefined
          ? {}
          : { maxOutputTokens: route.params.maxOutputTokens }),
        providerOptions: { openrouter: providerOptions },
      });
      const usage = (
        result.providerMetadata?.openrouter as { usage?: { cost?: unknown } } | undefined
      )?.usage;
      const answered = result.response.modelId || model;
      const generationId = result.response.id || null;
      let inputTokens = result.usage.inputTokens ?? 0;
      let outputTokens = result.usage.outputTokens ?? 0;
      let costUsd = typeof usage?.cost === "number" ? usage.cost : null;
      let costEstimated = false;
      if (costUsd === null && generationId !== null) {
        const looked = await lookupGenerationUsage(generationId, route.keyClass, {
          ...keyOptions,
          ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
        });
        if (looked) {
          costUsd = looked.costUsd;
          inputTokens = looked.inputTokens ?? inputTokens;
          outputTokens = looked.outputTokens ?? outputTokens;
        }
      }
      if (costUsd === null) {
        // Priced by the requested id: the response may drop the `:free` suffix.
        costUsd = estimateCostUsd(model, inputTokens, outputTokens);
        costEstimated = true;
      }
      return {
        ok: true,
        text: result.text,
        model: answered,
        generationId,
        inputTokens,
        outputTokens,
        costUsd,
        costEstimated,
        latencyMs: Math.round(performance.now() - t0),
      };
    } catch (error) {
      const config = isConfigError(error);
      if (config) throw config;
      const failure = describeFailure(error);
      const aborted = callerSignal?.aborted === true;
      // No HTTP response (timeout, abort, dropped connection): the request may still be billed, and
      // OpenRouter gave us no generation id to look up, so record an upper-bound estimate.
      const estimate =
        failure.status === null
          ? estimateAttemptCost(
              model,
              prompt.text.length + messages.reduce((n, m) => n + contentLength(m), 0),
              route.params?.maxOutputTokens,
            )
          : null;
      return {
        ok: false,
        failure: aborted ? { status: null, errorType: "aborted" } : failure,
        aborted,
        estimate,
        latencyMs: Math.round(performance.now() - t0),
      };
    }
  };

  /** Records a failed attempt; rethrows the caller's abort after the row is written. */
  const recordFailure = async (model: string, attempt: Extract<Attempt, { ok: false }>) => {
    await record({
      model,
      outcome: "error",
      inputTokens: attempt.estimate?.inputTokens ?? 0,
      outputTokens: attempt.estimate?.outputTokens ?? 0,
      costUsd: attempt.estimate?.costUsd ?? 0,
      costEstimated: attempt.estimate !== null,
      generationId: null,
      latencyMs: attempt.latencyMs,
    });
    if (attempt.aborted) throwIfAborted(callerSignal);
  };

  const recordAnswer = (attempt: Extract<Attempt, { ok: true }>, outcome: AiCallOutcome) =>
    record({
      model: attempt.model,
      outcome,
      inputTokens: attempt.inputTokens,
      outputTokens: attempt.outputTokens,
      costUsd: attempt.costUsd,
      costEstimated: attempt.costEstimated,
      generationId: attempt.generationId,
      latencyMs: attempt.latencyMs,
    });

  const success = (
    attempt: Extract<Attempt, { ok: true }>,
    data: T,
    outcome: "ok" | "repaired",
  ): StructuredTaskResult<T> => ({
    data,
    task,
    model: attempt.model,
    keyClass: route.keyClass,
    generationId: attempt.generationId,
    outcome,
    promptVersion: prompt.versionId,
    attempts,
    attemptedModels: [...attemptedModels],
    costUsd: totalCost,
    latencyMs: Math.round(performance.now() - started),
  });

  const chain = [route.model, ...route.fallbackModels];
  let lastFailure: { model: string; failure: Failure } | null = null;

  for (const model of chain) {
    attemptedModels.push(model);
    const messages: ModelMessage[] = [{ role: "user", content: input }];

    const first = await call(model, messages);
    if (!first.ok) {
      await recordFailure(model, first);
      lastFailure = { model, failure: first.failure };
      continue;
    }
    const firstCheck = validate(schema, first.text);
    await recordAnswer(first, firstCheck.ok ? "ok" : "invalid");
    if (firstCheck.ok) return success(first, firstCheck.data, "ok");

    // One repair retry on the same model: its invalid output, then what was wrong with it.
    const repair = await call(model, [
      ...messages,
      { role: "assistant", content: first.text.trim() === "" ? "(empty reply)" : first.text },
      {
        role: "user",
        content: `${firstCheck.feedback}\nReply again with only the corrected JSON, matching the schema exactly.`,
      },
    ]);
    if (!repair.ok) {
      await recordFailure(model, repair);
      lastFailure = { model, failure: repair.failure };
      continue;
    }
    const repairCheck = validate(schema, repair.text);
    await recordAnswer(repair, repairCheck.ok ? "repaired" : "invalid");
    if (!repairCheck.ok) {
      throw new AiOutputInvalidError(
        task,
        repair.model,
        repairCheck.issueCount,
        repairCheck.issuePaths,
      );
    }
    return success(repair, repairCheck.data, "repaired");
  }

  const last = lastFailure ?? { model: route.model, failure: { status: null, errorType: null } };
  throw new AiCallError(task, last.model, last.failure, attemptedModels);
}
