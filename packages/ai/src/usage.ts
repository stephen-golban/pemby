// Cost when a response did not carry `usage.cost`: ask OpenRouter's generation endpoint once, and
// otherwise estimate from a price table so the daily cap still sees the spend.
import { EMBEDDING_MODEL } from "@pemby/core";

import type { EnvLike, KeyClass } from "./keys";
import { openRouterApiKey } from "./keys";

const GENERATION_URL = "https://openrouter.ai/api/v1/generation";
const LOOKUP_TIMEOUT_MS = 5_000;

export interface GenerationUsage {
  costUsd: number;
  inputTokens: number | null;
  outputTokens: number | null;
  model: string | null;
}

function firstNumber(...values: unknown[]): number | null {
  for (const value of values) if (typeof value === "number") return value;
  return null;
}

/**
 * `GET /api/v1/generation?id=<id>` (openapi `getGeneration`: `data.total_cost`, `data.model`, and
 * token counts). Token counts prefer `native_tokens_*`, the provider's own counts, which match the
 * chat response's `usage` (a real lookup on 2026-09-17 gave native 103 vs normalised 28 prompt
 * tokens for the same call). One try with a short timeout;
 * returns null on any failure, including the 404 OpenRouter gives before its stats are written.
 */
export async function lookupGenerationUsage(
  generationId: string,
  keyClass: KeyClass,
  options: { userApiKey?: string; env?: EnvLike; fetch?: typeof globalThis.fetch } = {},
): Promise<GenerationUsage | null> {
  try {
    const apiKey = openRouterApiKey(keyClass, {
      ...(options.userApiKey === undefined ? {} : { userApiKey: options.userApiKey }),
      ...(options.env === undefined ? {} : { env: options.env }),
    });
    const response = await (options.fetch ?? globalThis.fetch)(
      `${GENERATION_URL}?id=${encodeURIComponent(generationId)}`,
      {
        headers: { authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
      },
    );
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      return null;
    }
    const body = (await response.json()) as {
      data?: {
        total_cost?: unknown;
        tokens_prompt?: unknown;
        tokens_completion?: unknown;
        native_tokens_prompt?: unknown;
        native_tokens_completion?: unknown;
        model?: unknown;
      };
    };
    const data = body.data;
    if (typeof data?.total_cost !== "number") return null;
    return {
      costUsd: data.total_cost,
      inputTokens: firstNumber(data.native_tokens_prompt, data.tokens_prompt),
      outputTokens: firstNumber(data.native_tokens_completion, data.tokens_completion),
      model: typeof data.model === "string" ? data.model : null,
    };
  } catch {
    return null;
  }
}

/**
 * USD per million tokens, [input, output]. Deliberately at or above the highest provider price seen
 * for each model (research 10 and `GET /api/v1/models/{id}/endpoints`, 2026-09-17), because an
 * estimate only feeds the daily cap and should err high. Unknown models use UNKNOWN_MODEL_PRICE.
 */
const PRICE_PER_MILLION: Readonly<Record<string, readonly [number, number]>> = {
  "openai/gpt-oss-120b": [0.15, 0.75],
  "deepseek/deepseek-v4-flash-0731": [0.1, 0.3],
  "google/gemini-2.5-flash-lite": [0.1, 0.4],
  "mistralai/mistral-small-2603": [0.15, 0.6],
  "anthropic/claude-haiku-4.5": [1, 5],
  // Embeddings are priced per input token only; every endpoint lists completion at 0, and an
  // embedding request has no output side, so the output price is 0 and never invents a cost.
  // OpenRouter lists the model at $0.01 per million input tokens
  // (`GET /api/v1/models?output_modalities=embeddings`, 2026-09-17); its endpoints are Nebius and
  // DeepInfra at $0.01 and SiliconFlow at $0.04
  // (`GET /api/v1/models/qwen/qwen3-embedding-8b/endpoints`). The table keeps the highest of them.
  [EMBEDDING_MODEL]: [0.04, 0],
};
const UNKNOWN_MODEL_PRICE: readonly [number, number] = [1, 5];
/** Output tokens assumed when the route sets no `maxOutputTokens`. */
const DEFAULT_ESTIMATED_OUTPUT_TOKENS = 2_000;

export interface CostEstimate {
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
}

/** Estimated USD for known token counts, from the conservative price table. `:free` costs 0. */
export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  if (model.endsWith(":free")) return 0;
  const [inputPrice, outputPrice] = PRICE_PER_MILLION[model] ?? UNKNOWN_MODEL_PRICE;
  return (inputTokens * inputPrice + outputTokens * outputPrice) / 1_000_000;
}

/**
 * Upper-bound cost of an attempt whose usage never arrived (timeout, abort, dropped connection):
 * input tokens at ~4 characters each, output at the route's `maxOutputTokens`.
 */
export function estimateAttemptCost(
  model: string,
  promptChars: number,
  maxOutputTokens: number | undefined,
): CostEstimate {
  const inputTokens = Math.ceil(promptChars / 4);
  const outputTokens = maxOutputTokens ?? DEFAULT_ESTIMATED_OUTPUT_TOKENS;
  return { costUsd: estimateCostUsd(model, inputTokens, outputTokens), inputTokens, outputTokens };
}
