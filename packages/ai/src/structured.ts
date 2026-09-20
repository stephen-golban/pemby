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
//
// Streaming (`runStreamingStructuredTask`): one streamed request on the route's primary model,
// feeding partial objects to the caller. If that request fails or its final object fails the
// schema, the task falls back to the non-streaming chain above (first call, repair, fallbacks).
// Every request, streamed or not, is one `ai_usage` row. Response Healing does not apply to
// streamed responses, which is why an invalid streamed object goes through the repair path.
import {
  APICallError,
  StreamProviderError,
  generateText,
  isDeepEqualData,
  parsePartialJson,
  streamText,
  type ModelMessage,
  type ProviderMetadata,
} from "ai";
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
  /** The upstream provider OpenRouter routed the answering request to, when it reported one. */
  provider: string | null;
}

export interface StreamingPartialMeta {
  /** Milliseconds since the task started. */
  elapsedMs: number;
}

export interface StreamingStructuredTaskOptions<T> extends StructuredTaskOptions<T> {
  /**
   * Called with each new partial object (parsed from incomplete JSON, not validated), in order and
   * never concurrently: the stream waits for the returned promise. Throttling is the caller's job.
   * A throw cancels the request, writes its row, and is rethrown without a fallback.
   */
  onPartial: (partial: unknown, meta: StreamingPartialMeta) => void | Promise<void>;
}

export interface StreamingStructuredTaskResult<T> extends StructuredTaskResult<T> {
  /** True when the streamed request's own output was used; false when the fallback path answered. */
  streamed: boolean;
}

/** Every model in the chain failed. Carries no request or response content. */
export class AiCallError extends Error {
  readonly task: AiTask;
  readonly model: string;
  /** HTTP status, or null for timeouts and network failures. */
  readonly status: number | null;
  /** OpenRouter `error.metadata.error_type` when present, `timeout`, or `network`. */
  readonly errorType: string | null;
  /**
   * On a 402, which limit was hit, as a whitelisted token (`PAYMENT_LIMIT_SOURCES`). Carried on the
   * error because the caller that has to decide — tell the user to top up, or wait and retry — is
   * several frames above the response body. Read it through `paymentRequiredKindOf`.
   */
  readonly limitSource: PaymentLimitSource | null;
  /**
   * Parsed `Retry-After` in seconds, or null when the response carried none. Null is not "retry
   * now": a caller with no duration backs off on its own schedule.
   */
  readonly retryAfter: number | null;
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
    this.limitSource = failure.limitSource;
    this.retryAfter = failure.retryAfter;
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

/** Exported inside the package only (not from `index.ts`); `embeddings.ts` reuses it. */
export interface Failure {
  status: number | null;
  errorType: string | null;
  /**
   * OpenRouter's `error.metadata.limit_source` on a 402, as a **whitelisted enum token** — not a
   * free-text passthrough. See `PAYMENT_LIMIT_SOURCES`.
   */
  limitSource: PaymentLimitSource | null;
  /**
   * `Retry-After` in **seconds**, parsed, when the response carried one.
   *
   * A number, never the header string: `Retry-After` is an integer or an HTTP date, so there is no
   * free-text risk, but a caller handed `"Mon, 21 Sep 2026 12:00:00 GMT"` will do arithmetic on it.
   * `null` means the response said nothing — which is not "retry now": the only retryable payment
   * failure is `in-flight`, and a caller with no duration should back off on its own schedule
   * rather than hot-loop against someone's own key.
   *
   * **A mid-stream failure always has `null` here.** `StreamProviderError` carries the provider's
   * error payload and no response headers: the headers belonged to the 200 that opened the stream.
   */
  retryAfter: number | null;
}

const SAFE_TOKEN = /^[a-z][a-z0-9_]{0,63}$/;

function safeToken(value: unknown): string | null {
  return typeof value === "string" && SAFE_TOKEN.test(value) ? value : null;
}

/**
 * 402 is not one condition, and until phase 09 nothing here could tell the three apart.
 *
 * | `limit_source`                 | Meaning                                  | Retry? |
 * |--------------------------------|------------------------------------------|--------|
 * | `openrouter_credits`           | The balance cannot cover the request     | No     |
 * | `openrouter_key_limit`         | The key's own cap is exhausted           | No     |
 * | `openrouter_in_flight_budget`  | Transient; sends `Retry-After`           | **Yes**|
 *
 * The third one can fire with a healthy positive balance, which is why "402 means out of money" is
 * wrong and why a user connecting their own key would otherwise be told to top up an account that
 * is fine. No SDK retries a 402 on its own, `ai@7` included: the decision is the caller's.
 *
 * The list is closed on purpose. `limit_source` is not personal data, but a value copied out of a
 * response body into a log or `pgboss.job.output` is a free-text passthrough whatever it is called
 * today, so an unknown value is dropped exactly as an unrecognised `error_type` is.
 */
export const PAYMENT_LIMIT_SOURCES = [
  "openrouter_credits",
  "openrouter_key_limit",
  "openrouter_in_flight_budget",
] as const;
export type PaymentLimitSource = (typeof PAYMENT_LIMIT_SOURCES)[number];

/** What the caller decides with: whose money ran out, and whether waiting can help. */
export type PaymentRequiredKind = "credits" | "key-limit" | "in-flight";

const PAYMENT_REQUIRED_KIND: Record<PaymentLimitSource, PaymentRequiredKind> = {
  openrouter_credits: "credits",
  openrouter_key_limit: "key-limit",
  openrouter_in_flight_budget: "in-flight",
};

function limitSource(value: unknown): PaymentLimitSource | null {
  return typeof value === "string" && (PAYMENT_LIMIT_SOURCES as readonly string[]).includes(value)
    ? (value as PaymentLimitSource)
    : null;
}

/** A day. A `Retry-After` beyond this is a provider bug, not a wait a job should honour. */
const MAX_RETRY_AFTER_SECONDS = 86_400;

/**
 * `Retry-After` as whole seconds, from either RFC 9110 form: a delay in seconds, or an HTTP date.
 * Anything else — absent, unparsable, negative, absurd — is `null`, never a guess.
 */
function retryAfterOf(headers: Record<string, string> | undefined, now: number): number | null {
  const raw = headers?.["retry-after"] ?? headers?.["Retry-After"];
  if (typeof raw !== "string" || raw.trim() === "") return null;
  const value = raw.trim();

  const seconds = /^\d+$/.test(value) ? Number(value) : (Date.parse(value) - now) / 1000;
  if (!Number.isFinite(seconds)) return null;
  const whole = Math.ceil(seconds);
  if (whole < 0 || whole > MAX_RETRY_AFTER_SECONDS) return null;
  return whole;
}

/**
 * The shape of OpenRouter's error body, reduced to the four fields that are safe to read. Shared
 * by both describers so the streamed path and the HTTP path cannot read different fields.
 */
type ErrorBody = {
  code?: unknown;
  type?: unknown;
  metadata?: { error_type?: unknown; limit_source?: unknown };
};

/** Status, error type and 402 limit source only; the rest of an SDK error can hold content. */
export function describeFailure(error: unknown): Failure {
  if (APICallError.isInstance(error)) {
    // Failed responses parse to `{ error: {...} }`; a 200 carrying an error passes the inner object.
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
      limitSource: limitSource(body.metadata?.limit_source),
      retryAfter: retryAfterOf(error.responseHeaders, Date.now()),
    };
  }
  if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
    return { status: null, errorType: "timeout", limitSource: null, retryAfter: null };
  }
  return { status: null, errorType: "network", limitSource: null, retryAfter: null };
}

/**
 * A streamed error: an SDK error, or the raw `{ code, message, metadata }` object OpenRouter sends
 * in an SSE chunk after the stream started. Only the numeric code and error type are read.
 */
function describeStreamFailure(error: unknown): Failure {
  // **This branch is the production path, and the order matters.** A provider error raised after
  // the response stream has started reaches `result.stream`'s `error` part as a
  // `StreamProviderError` — which is an `Error` and is **not** an `APICallError`, so delegating on
  // `instanceof Error` sent every mid-stream 402 through `describeFailure`, out the bottom as
  // `{status: null, errorType: "network"}`, and a user whose credits ran out mid-generation was
  // told the network failed. Verified against the real object built by `ai@7.0.101` through the
  // real provider: `name` is `AI_StreamProviderError`, `APICallError.isInstance` is `false`,
  // `statusCode` is the HTTP-equivalent code, and `data` holds OpenRouter's own error payload —
  // already unwrapped from its `{ error: ... }` envelope, though the `?? body` below tolerates
  // either. There are no response headers on this path, so `retryAfter` is null by construction.
  if (StreamProviderError.isInstance(error)) {
    const payload = (error.data ?? {}) as ErrorBody & { error?: ErrorBody };
    const body: ErrorBody = payload.error ?? payload;
    const code = typeof body.code === "number" ? body.code : null;
    const status = typeof error.statusCode === "number" ? error.statusCode : code;
    return {
      status,
      errorType:
        safeToken(body.metadata?.error_type) ??
        safeToken(body.type) ??
        (status === null ? "network" : null),
      limitSource: limitSource(body.metadata?.limit_source),
      retryAfter: null,
    };
  }
  if (error instanceof Error || typeof error !== "object" || error === null) {
    return describeFailure(error);
  }
  // A bare `{ code, message, metadata }` object. Not a shape the SDK produces today; kept as a
  // tolerant fallback for a raw payload read straight off the wire, and deliberately not asserted
  // in `scripts/check-user-key.ts` — a check against a fixture of a shape nothing produces is how
  // the branch above went wrong in the first place.
  const body = error as ErrorBody;
  const status = typeof body.code === "number" ? body.code : null;
  return {
    status,
    errorType:
      safeToken(body.metadata?.error_type) ??
      safeToken(body.type) ??
      (status === null ? "network" : null),
    limitSource: limitSource(body.metadata?.limit_source),
    retryAfter: null,
  };
}

/**
 * Which kind of 402 this is, or `null` when it is not a classified payment failure.
 *
 * Accepts what a caller will actually be holding: the `AiCallError` this module throws, a raw
 * `APICallError` from the SDK, or the bare `{ code, message, metadata }` object OpenRouter sends in
 * an SSE chunk **after** a streaming request has already returned 200 — on that path the failure
 * never arrives as an HTTP status at all, which is why `describeStreamFailure` exists.
 *
 * `null` means "not a 402 we can name", which includes a 402 whose `limit_source` is absent or is a
 * value not on the whitelist. It does not mean "safe to retry": only `"in-flight"` is retryable,
 * and every other outcome, `null` included, is the caller's cue to stop and say why.
 */
export function paymentRequiredKindOf(error: unknown): PaymentRequiredKind | null {
  const failure =
    error instanceof AiCallError
      ? { status: error.status, limitSource: error.limitSource }
      : describeStreamFailure(error);
  if (failure.status !== 402 || failure.limitSource === null) return null;
  return PAYMENT_REQUIRED_KIND[failure.limitSource];
}

function openRouterProviderName(metadata: ProviderMetadata | undefined): string | null {
  const provider = (metadata?.openrouter as { provider?: unknown } | undefined)?.provider;
  return typeof provider === "string" ? provider : null;
}

export function isConfigError(error: unknown): AiConfigError | null {
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
      provider: string | null;
    }
  | {
      ok: false;
      failure: Failure;
      /** The caller's abortSignal fired (not the per-attempt timeout). */
      aborted: boolean;
      estimate: CostEstimate | null;
      latencyMs: number;
    };

export function throwIfAborted(signal: AbortSignal | undefined): void {
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
  return (await prepareRun(options)).chain();
}

/**
 * Streams one request on the route's primary model and passes each new partial object to
 * `onPartial`. The final object is validated with the schema. When the streamed request fails
 * (HTTP error, mid-stream error, timeout, dropped connection) or its final object is invalid, its
 * row is written and the task continues exactly as `runStructuredTask` would (first call, one
 * repair retry, the route's fallbacks), with `streamed: false`. The cap is checked before every
 * request. Throws what `runStructuredTask` throws, plus whatever `onPartial` throws. The caller's
 * abort during the stream writes the row and throws without a fallback.
 */
export async function runStreamingStructuredTask<T>(
  options: StreamingStructuredTaskOptions<T>,
): Promise<StreamingStructuredTaskResult<T>> {
  const run = await prepareRun(options);
  const streamedResult = await run.stream(options.onPartial);
  if (streamedResult) return { ...streamedResult, streamed: true };
  return { ...(await run.chain()), streamed: false };
}

async function prepareRun<T>(options: StructuredTaskOptions<T>) {
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

  const callSettings = () => ({
    instructions: prompt.text,
    maxRetries: 0,
    ...(route.params?.temperature === undefined ? {} : { temperature: route.params.temperature }),
    ...(route.params?.maxOutputTokens === undefined
      ? {}
      : { maxOutputTokens: route.params.maxOutputTokens }),
    providerOptions: { openrouter: providerOptions },
  });

  /** Cost of an answered request: `usage.cost`, else the generation lookup, else an estimate. */
  const priceAnswer = async (
    model: string,
    answer: {
      text: string;
      modelId: string | undefined;
      responseId: string | undefined;
      inputTokens: number | undefined;
      outputTokens: number | undefined;
      providerMetadata: ProviderMetadata | undefined;
    },
    t0: number,
  ): Promise<Extract<Attempt, { ok: true }>> => {
    const usage = (
      answer.providerMetadata?.openrouter as { usage?: { cost?: unknown } } | undefined
    )?.usage;
    const answered = answer.modelId || model;
    const generationId = answer.responseId || null;
    let inputTokens = answer.inputTokens ?? 0;
    let outputTokens = answer.outputTokens ?? 0;
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
      text: answer.text,
      model: answered,
      generationId,
      inputTokens,
      outputTokens,
      costUsd,
      costEstimated,
      latencyMs: Math.round(performance.now() - t0),
      provider: openRouterProviderName(answer.providerMetadata),
    };
  };

  /** Upper-bound cost of a request that got no usage back. */
  const estimateFor = (model: string, messages: ModelMessage[]) =>
    estimateAttemptCost(
      model,
      prompt.text.length + messages.reduce((n, m) => n + contentLength(m), 0),
      route.params?.maxOutputTokens,
    );

  const call = async (model: string, messages: ModelMessage[]): Promise<Attempt> => {
    throwIfAborted(callerSignal);
    await checkCap();
    attempts += 1;
    const t0 = performance.now();
    const timeout = AbortSignal.timeout(timeoutMs);
    try {
      const result = await generateText({
        model: provider.chat(model),
        messages,
        abortSignal: callerSignal ? AbortSignal.any([callerSignal, timeout]) : timeout,
        ...callSettings(),
      });
      return await priceAnswer(
        model,
        {
          text: result.text,
          modelId: result.response.modelId,
          responseId: result.response.id,
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          providerMetadata: result.providerMetadata,
        },
        t0,
      );
    } catch (error) {
      const config = isConfigError(error);
      if (config) throw config;
      const failure = describeFailure(error);
      const aborted = callerSignal?.aborted === true;
      // No HTTP response (timeout, abort, dropped connection): the request may still be billed, and
      // OpenRouter gave us no generation id to look up, so record an upper-bound estimate.
      const estimate = failure.status === null ? estimateFor(model, messages) : null;
      return {
        ok: false,
        failure: aborted
          ? { status: null, errorType: "aborted", limitSource: null, retryAfter: null }
          : failure,
        aborted,
        estimate,
        latencyMs: Math.round(performance.now() - t0),
      };
    }
  };

  /**
   * The first attempt that failed with a **classified** payment failure, across the streamed
   * attempt and every model in the fallback chain.
   *
   * Kept because `AiCallError` is otherwise built from the *last* failure, and the last failure is
   * rarely the informative one: `model1 -> 402 openrouter_credits` then `model2 -> 429` threw a 429,
   * so a user who is genuinely out of credits was told the service was busy and asked to try again,
   * which it will never satisfy. The first classified 402 is the actionable truth about the whole
   * chain — every subsequent model is paid for out of the same empty balance.
   */
  let paymentFailure: { model: string; failure: Failure } | null = null;

  /** Records a failed attempt; rethrows the caller's abort after the row is written. */
  const recordFailure = async (model: string, attempt: Extract<Attempt, { ok: false }>) => {
    if (
      paymentFailure === null &&
      attempt.failure.status === 402 &&
      attempt.failure.limitSource !== null
    ) {
      paymentFailure = { model, failure: attempt.failure };
    }
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
    provider: attempt.provider,
  });

  /**
   * One streamed request. Partials are parsed from the accumulated text and passed on only when
   * they changed; `onPartial` is awaited inside the read loop, so calls never overlap. A throw from
   * `onPartial` cancels the request, writes an error row with an estimate, and is rethrown.
   */
  const streamCall = async (
    model: string,
    messages: ModelMessage[],
    onPartial: StreamingStructuredTaskOptions<T>["onPartial"],
  ): Promise<Attempt> => {
    throwIfAborted(callerSignal);
    await checkCap();
    attempts += 1;
    const t0 = performance.now();
    const timeout = AbortSignal.timeout(timeoutMs);
    const cancel = new AbortController();
    const signals = [cancel.signal, timeout, ...(callerSignal ? [callerSignal] : [])];

    let text = "";
    let lastPartial: unknown = undefined;
    let finish: {
      modelId: string | undefined;
      responseId: string | undefined;
      inputTokens: number | undefined;
      outputTokens: number | undefined;
      providerMetadata: ProviderMetadata | undefined;
    } | null = null;
    let streamError: { error: unknown } | null = null;
    let abortedPart = false;
    let callbackError: { error: unknown } | null = null;

    try {
      const result = streamText({
        model: provider.chat(model),
        messages,
        abortSignal: AbortSignal.any(signals),
        // The default handler console.errors the SDK error, which can carry the response body.
        onError: () => undefined,
        ...callSettings(),
      });
      for await (const part of result.stream) {
        if (part.type === "text-delta") {
          text += part.text;
          const { value, state } = await parsePartialJson(text);
          if (
            (state === "successful-parse" || state === "repaired-parse") &&
            typeof value === "object" &&
            value !== null &&
            !isDeepEqualData(value, lastPartial)
          ) {
            lastPartial = value;
            try {
              await onPartial(value, { elapsedMs: Math.round(performance.now() - started) });
            } catch (error) {
              callbackError = { error };
              cancel.abort();
              break;
            }
          }
        } else if (part.type === "finish-step") {
          finish = {
            modelId: part.response.modelId,
            responseId: part.response.id,
            inputTokens: part.usage.inputTokens,
            outputTokens: part.usage.outputTokens,
            providerMetadata: part.providerMetadata,
          };
        } else if (part.type === "error") {
          streamError ??= { error: part.error };
        } else if (part.type === "abort") {
          abortedPart = true;
        }
      }
    } catch (error) {
      streamError ??= { error };
    }

    if (streamError) {
      const config = isConfigError(streamError.error);
      if (config) throw config;
    }
    if (!callbackError && !streamError && !abortedPart && finish !== null) {
      return priceAnswer(model, { text, ...finish }, t0);
    }

    const aborted = callerSignal?.aborted === true;
    const failure: Failure = aborted
      ? { status: null, errorType: "aborted", limitSource: null, retryAfter: null }
      : callbackError
        ? { status: null, errorType: "callback", limitSource: null, retryAfter: null }
        : streamError
          ? describeStreamFailure(streamError.error)
          : {
              status: null,
              errorType: timeout.aborted ? "timeout" : "network",
              limitSource: null,
              retryAfter: null,
            };
    // A request that got no usage back may still be billed; once text arrived it certainly is.
    const estimate =
      failure.status === null || text.length > 0 ? estimateFor(model, messages) : null;
    const attempt: Extract<Attempt, { ok: false }> = {
      ok: false,
      failure,
      aborted,
      estimate,
      latencyMs: Math.round(performance.now() - t0),
    };
    if (callbackError) {
      await recordFailure(model, attempt);
      throw callbackError.error;
    }
    return attempt;
  };

  /** The streamed request. Null when the caller should fall back to `chain`; its row is written. */
  const stream = async (
    onPartial: StreamingStructuredTaskOptions<T>["onPartial"],
  ): Promise<StructuredTaskResult<T> | null> => {
    const model = route.model;
    attemptedModels.push(model);
    const attempt = await streamCall(model, [{ role: "user", content: input }], onPartial);
    if (!attempt.ok) {
      await recordFailure(model, attempt);
      return null;
    }
    const check = validate(schema, attempt.text);
    await recordAnswer(attempt, check.ok ? "ok" : "invalid");
    return check.ok ? success(attempt, check.data, "ok") : null;
  };

  /** The non-streaming chain: first call, one repair retry, then each fallback model. */
  const chain = async (): Promise<StructuredTaskResult<T>> => {
    // After a streamed attempt the primary model is listed again by the loop below.
    attemptedModels.length = 0;
    const models = [route.model, ...route.fallbackModels];
    let lastFailure: { model: string; failure: Failure } | null = null;

    for (const model of models) {
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

    // The first classified payment failure wins over the last failure of any kind: see the note on
    // `paymentFailure`. `attemptedModels` still lists everything that was tried.
    const last = paymentFailure ??
      lastFailure ?? {
        model: route.model,
        failure: { status: null, errorType: null, limitSource: null, retryAfter: null },
      };
    throw new AiCallError(task, last.model, last.failure, attemptedModels);
  };

  return { stream, chain };
}
