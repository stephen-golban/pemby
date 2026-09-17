// `rules+llm:<model>`: deterministic rules, one `job-enrichment` call pinned to one model, the
// LLM-to-signal mapping, then the eligibility engine. Company evidence is not used (the labels
// judge the post alone).
//
// Model outputs are cached under `eval/.cache/rules-llm/` (gitignored), keyed by model, prompt
// version plus a hash of the prompt text, and a hash of the post input, so re-running the engine
// or the scoring costs nothing. `--no-cache` in the runner is not needed: delete the directory.
//
// Needs OPENROUTER_KEY_PUBLIC and the private config (PRIVATE_CONFIG_DIR, APP_ENV). Public post
// text only, on the public key. Calls are metered in memory, never in `ai_usage`.
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  AiCallError,
  AiOutputInvalidError,
  createDailyCapGuard,
  loadPrompt,
  runStructuredTask,
  type AiUsageEntry,
  type CostLedger,
  type TaskParams,
} from "@pemby/ai";
import {
  buildEnrichmentInput,
  decideEligibility,
  extractRuleSignals,
  jobEnrichmentOutputSchema,
  llmToSignals,
  type EnrichmentPost,
  type JobEnrichmentOutput,
} from "@pemby/core";

import { PipelineCallError, type EligibilityPipeline, type PipelineOutput } from "../pipeline";
import { EVAL_DIR } from "../util";

/** Models compared in phase 05, with the call parameters used for each. */
export const RULES_LLM_MODELS: Readonly<Record<string, TaskParams>> = {
  // Nemotron on NVIDIA's free endpoint reasons by default: one post took 2,062 reasoning tokens
  // and 97 s. `reasoning.enabled: false` gave 0 reasoning tokens and valid JSON (checked
  // 2026-09-17; `effort: "none"` returned 503). gpt-oss-120b with `effort: "low"`: 307 reasoning
  // tokens, valid JSON, 18 s.
  "nvidia/nemotron-3-super-120b-a12b:free": {
    temperature: 0,
    maxOutputTokens: 6000,
    reasoning: { enabled: false },
  },
  "openai/gpt-oss-120b": {
    temperature: 0,
    maxOutputTokens: 6000,
    reasoning: { effort: "low" },
  },
  // Gemini 3.1 Flash Lite: every OpenRouter endpoint lists `structured_outputs`, `response_format`,
  // `reasoning` and `reasoning_effort` (models API, 2026-09-17). Effort "low" matches gpt-oss-120b.
  "google/gemini-3.1-flash-lite": {
    temperature: 0,
    maxOutputTokens: 6000,
    reasoning: { effort: "low" },
  },
};

const CACHE_DIR = path.join(EVAL_DIR, ".cache", "rules-llm");

interface CachedCall {
  data: JobEnrichmentOutput;
  model: string;
  outcome: "ok" | "repaired";
  promptVersion: string;
  attempts: number;
  costUsd: number;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
}

const sha = (text: string, length = 16) =>
  createHash("sha256").update(text).digest("hex").slice(0, length);
const slug = (model: string) => model.replace(/[^a-zA-Z0-9.-]+/g, "_");

function memoryLedger(): CostLedger & { entries: AiUsageEntry[] } {
  const entries: AiUsageEntry[] = [];
  return {
    entries,
    async record(entry) {
      entries.push(entry);
    },
    async spentOnDayUsd() {
      return 0;
    },
  };
}

async function readCache(file: string): Promise<CachedCall | null> {
  try {
    const parsed = JSON.parse(await readFile(file, "utf8")) as CachedCall;
    const check = jobEnrichmentOutputSchema.safeParse(parsed.data);
    return check.success ? { ...parsed, data: check.data } : null;
  } catch {
    return null;
  }
}

function describeError(error: unknown): string {
  if (error instanceof AiCallError)
    return `ai call failed (status ${error.status ?? "-"}, ${error.errorType ?? "-"})`;
  if (error instanceof AiOutputInvalidError)
    return `invalid output after repair (${error.issueCount} issues)`;
  return error instanceof Error ? `${error.name}: ${error.message}` : "error";
}

export function rulesLlmPipeline(model: string, params?: TaskParams): EligibilityPipeline {
  const effectiveParams = params ?? RULES_LLM_MODELS[model];
  return {
    name: `rules+llm:${model}`,
    async evaluate(snapshot, countries, ways): Promise<PipelineOutput> {
      const post: EnrichmentPost = {
        title: snapshot.title,
        company: snapshot.company,
        locations: snapshot.locations,
        workplaceType: snapshot.workplaceType,
        employmentType: snapshot.employmentType,
        descriptionText: snapshot.descriptionText,
      };
      const input = buildEnrichmentInput(post).text;
      const prompt = await loadPrompt("job-enrichment");
      const promptKey = `${prompt.version}-${sha(prompt.text, 12)}-${sha(JSON.stringify(effectiveParams ?? {}), 8)}`;
      const file = path.join(CACHE_DIR, slug(model), promptKey, `${sha(input)}.json`);

      let call = await readCache(file);
      const cached = call !== null;
      if (!call) {
        const ledger = memoryLedger();
        try {
          const result = await runStructuredTask({
            task: "job-enrichment",
            schema: jobEnrichmentOutputSchema,
            input,
            prompt,
            ledger,
            capGuard: createDailyCapGuard({ ledger, capUsd: 1 }),
            context: { runLabel: `eval:${model}` },
            routeOverride: { model, ...(effectiveParams ? { params: effectiveParams } : {}) },
            // The free Nemotron endpoint took 50 to 100 s per post in phase 05 checks.
            timeoutMs: 180_000,
          });
          call = {
            data: result.data,
            model: result.model,
            outcome: result.outcome,
            promptVersion: result.promptVersion,
            attempts: result.attempts,
            costUsd: result.costUsd,
            latencyMs: result.latencyMs,
            inputTokens: ledger.entries.reduce((n, e) => n + e.inputTokens, 0),
            outputTokens: ledger.entries.reduce((n, e) => n + e.outputTokens, 0),
          };
          await mkdir(path.dirname(file), { recursive: true });
          await writeFile(file, `${JSON.stringify(call, null, 2)}\n`);
        } catch (error) {
          const spent = ledger.entries.reduce((n, e) => n + e.costUsd, 0);
          const outcomes = ledger.entries.map((e) => e.outcome ?? "ok").join(",");
          console.error(
            `[rules+llm] ${model} post=${sha(input, 8)} outcome=failed calls=${ledger.entries.length} [${outcomes}] cost=$${spent.toFixed(6)}: ${describeError(error)}`,
          );
          throw new PipelineCallError(
            describeError(error),
            error instanceof AiOutputInvalidError ? "invalid" : "error",
            {
              costUsd: spent,
              inputTokens: ledger.entries.reduce((n, e) => n + e.inputTokens, 0),
              outputTokens: ledger.entries.reduce((n, e) => n + e.outputTokens, 0),
              calls: ledger.entries.length,
            },
          );
        }
      }

      const llm = llmToSignals(call.data, post);
      console.error(
        `[rules+llm] ${model} post=${sha(input, 8)} outcome=${call.outcome}${cached ? " (cached)" : ""} attempts=${call.attempts} cost=$${call.costUsd.toFixed(6)} latency=${call.latencyMs}ms tokens=${call.inputTokens}/${call.outputTokens} signals=${llm.signals.length} dropped=${llm.dropped} unverified=${llm.unverifiedQuotes}`,
      );

      const verdicts = decideEligibility({
        rules: extractRuleSignals({
          title: snapshot.title,
          locations: snapshot.locations,
          workplaceType: snapshot.workplaceType,
          employmentType: snapshot.employmentType,
          descriptionText: snapshot.descriptionText,
        }),
        llm: { signals: llm.signals, model: call.model },
        countries,
        ways,
        // Region memberships and evidence freshness as of when the post was captured (as rules-only).
        now: new Date(snapshot.capturedAt),
      });
      return {
        verdicts: verdicts.flatMap((v) =>
          (ways as readonly string[]).includes(v.wayOfWorking)
            ? [
                {
                  country: v.country,
                  wayOfWorking: v.wayOfWorking as (typeof ways)[number],
                  tier: v.tier,
                  reason: `${v.reasonKey}: ${v.reason}`,
                },
              ]
            : [],
        ),
        // Cached posts report the original call's numbers, marked `cached`, so the runner can tell
        // model cost apart from what this run spent.
        usage: {
          costUsd: call.costUsd,
          inputTokens: call.inputTokens,
          outputTokens: call.outputTokens,
          calls: call.attempts,
          cached,
          modelLatencyMs: call.latencyMs,
        },
        outcome: call.outcome,
      };
    },
  };
}
