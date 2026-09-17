// The adapter the runner calls. The real eligibility engine (packages/core) plugs in here as another
// entry in PIPELINES; until then only a trivial baseline exists so the runner works end to end.
import type { EligibilityTier } from "@pemby/core";
import type { EvalWay, Snapshot } from "./schema";

export interface PipelineVerdict {
  country: string;
  wayOfWorking: EvalWay;
  tier: EligibilityTier;
  /** Short human-readable reason; may quote the post, so it stays out of committed reports. */
  reason: string;
}

/** Optional usage an adapter can report for one post. The runner sums it. */
export interface PipelineUsage {
  costUsd?: number;
  inputTokens?: number;
  outputTokens?: number;
  /** Model calls made for this post. */
  calls?: number;
  /** True when the model output came from a local cache: the numbers above are the original call's. */
  cached?: boolean;
  /** Model call time for this post (the original call's when cached). */
  modelLatencyMs?: number;
}

export interface PipelineOutput {
  verdicts: PipelineVerdict[];
  usage?: PipelineUsage;
  /** Schema outcome of the model output: valid at once, or valid after the repair retry. */
  outcome?: "ok" | "repaired";
}

/**
 * Thrown by an adapter whose model call failed. `invalid`: output failed the schema after the
 * repair retry; `error`: the call itself failed. The runner counts both.
 */
export class PipelineCallError extends Error {
  constructor(
    message: string,
    readonly outcome: "invalid" | "error",
    readonly usage?: PipelineUsage,
  ) {
    super(message);
    this.name = "PipelineCallError";
  }
}

export interface EligibilityPipeline {
  name: string;
  /**
   * Tier for every (country x way) pair of one post. Return the verdicts alone, or with usage.
   * Latency is measured by the runner around this call.
   */
  evaluate(
    snapshot: Snapshot,
    countries: readonly string[],
    ways: readonly EvalWay[],
  ): Promise<PipelineVerdict[] | PipelineOutput>;
}

/** Answers `white` (unclear) everywhere: the floor any real pipeline must beat. */
export const baselineWhite: EligibilityPipeline = {
  name: "baseline-white",
  async evaluate(_snapshot, countries, ways) {
    return countries.flatMap((country) =>
      ways.map((wayOfWorking) => ({
        country,
        wayOfWorking,
        tier: "white" as const,
        reason: "baseline: always unclear",
      })),
    );
  },
};

/** Pipelines selectable with `--pipeline <name>`. Loaded lazily so heavy adapters cost nothing. */
export const PIPELINES: Record<string, () => Promise<EligibilityPipeline>> = {
  "baseline-white": async () => baselineWhite,
  "rules-only": async () => (await import("./pipelines/rules-only")).rulesOnly,
  ...Object.fromEntries(
    [
      "nvidia/nemotron-3-super-120b-a12b:free",
      "openai/gpt-oss-120b",
      "google/gemini-3.1-flash-lite",
    ].map((m) => [
      `rules+llm:${m}`,
      async () => (await import("./pipelines/rules-llm")).rulesLlmPipeline(m),
    ]),
  ),
};
