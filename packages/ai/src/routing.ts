// Task routing (PLAN D19). Model ids are public; prompts are private config.
import { AI_TASKS, EMBEDDING_DIMENSIONS, EMBEDDING_MODEL, type AiTask } from "@pemby/core";
import {
  ROUTED_PROMPTS,
  loadRoutingConfig,
  type RoutedPromptName,
  type RoutingConfig,
  type TaskParams,
} from "@pemby/core/private-config";

import { getOpenRouter, type KeyClass, type OpenRouterOptions } from "./keys";

// Task names are shared with the `ai_task` enum in `@pemby/db`, and the embedding size with its
// `halfvec` columns, so both live in `@pemby/core`.
export { AI_TASKS, EMBEDDING_DIMENSIONS, EMBEDDING_MODEL, type AiTask } from "@pemby/core";
export type { RoutingConfig, TaskParams } from "@pemby/core/private-config";

export type ModelKind = "language" | "embedding";

export interface TaskRoute {
  model: string;
  /**
   * Tried in order after `model` fails. `languageModelForTask` sends them as OpenRouter `models`;
   * `runStructuredTask` walks them client-side so each attempt is metered on its own.
   */
  fallbackModels: readonly string[];
  keyClass: KeyClass;
  kind: ModelKind;
  /** Personal data (CVs, profiles, kits, CV embeddings) must never use the public key. */
  personalData: boolean;
  /**
   * Prompt file name in the private config, if the task uses one. Limited to core's ROUTED_PROMPTS:
   * REQUIRED_PROMPTS are checked at boot, OPTIONAL_PROMPTS when the task runs.
   */
  promptName: RoutedPromptName | null;
  /** Temperature, output-token and reasoning settings; from `routing.json` when it sets them. */
  params?: TaskParams;
}

export type RoutingTable = Readonly<Record<AiTask, TaskRoute>>;

// Production routing for job-enrichment and company-evidence: owner decision 2026-09-17, from the
// model comparison in eval/reports/2026-09-17-model-comparison.md. gpt-oss-120b beat the free
// Nemotron route on accuracy and reliability (Nemotron's free endpoint errored on roughly half the
// posts) and beat Gemini 3.1 Flash-Lite on yellow-or-better recall at a fraction of the cost, so it
// is now the job-enrichment primary; Nemotron free is dropped. Company evidence was not covered by
// that comparison (it is not scored the same way), so the owner picked Gemini 3.1 Flash-Lite as
// primary there for cost, with gpt-oss-120b as fallback. Both routes share one `reasoning.effort:
// "low"` param set: `google/gemini-3.1-flash-lite` and `openai/gpt-oss-120b` both list `reasoning`,
// `reasoning_effort` and `structured_outputs`/`response_format` in the OpenRouter models API
// (checked 2026-09-17), so `provider.require_parameters: true` accepts the param on whichever model
// in the chain answers.
export const DEFAULT_ROUTING = {
  "job-enrichment": {
    model: "openai/gpt-oss-120b",
    fallbackModels: ["google/gemini-3.1-flash-lite"],
    keyClass: "public",
    kind: "language",
    personalData: false,
    promptName: "job-enrichment",
    params: { temperature: 0, maxOutputTokens: 6000, reasoning: { effort: "low" } },
  },
  "cv-parse": {
    model: "google/gemini-2.5-flash-lite",
    fallbackModels: [],
    keyClass: "private",
    kind: "language",
    personalData: true,
    promptName: "cv-parse",
  },
  "job-embedding": {
    model: EMBEDDING_MODEL,
    fallbackModels: [],
    keyClass: "private",
    kind: "embedding",
    personalData: false,
    promptName: null,
  },
  "profile-embedding": {
    model: EMBEDDING_MODEL,
    fallbackModels: [],
    keyClass: "private",
    kind: "embedding",
    personalData: true,
    promptName: null,
  },
  // No temperature: a cover letter is not an extraction task, and pinning it to 0 would buy a
  // determinism nobody wants at the price of every letter reading the same. It does get a
  // ceiling. `KIT_LIMITS` in `@pemby/core` bounds the three sections to roughly 25,000 characters
  // — about 7,000 tokens — for a maximal legitimate kit, against the 775 output tokens a real one
  // spent, so 8000 clears the worst honest case with headroom and still caps a model that has
  // started looping. It also gives `estimateAttemptCost` a real ceiling for an attempt whose usage
  // never came back, instead of the flat `DEFAULT_ESTIMATED_OUTPUT_TOKENS` a capless route takes.
  "application-kit": {
    model: "anthropic/claude-haiku-4.5",
    fallbackModels: [],
    keyClass: "private",
    kind: "language",
    personalData: true,
    promptName: "application-kit",
    params: { maxOutputTokens: 8000 },
  },
  "company-evidence": {
    model: "google/gemini-3.1-flash-lite",
    fallbackModels: ["openai/gpt-oss-120b"],
    keyClass: "public",
    kind: "language",
    personalData: false,
    promptName: "company-evidence",
    params: { temperature: 0, maxOutputTokens: 6000, reasoning: { effort: "low" } },
  },
} as const satisfies RoutingTable;

export class PersonalDataRoutingError extends Error {
  constructor(task: AiTask) {
    super(`[ai] Task "${task}" carries personal data and cannot use the public OpenRouter key.`);
    this.name = "PersonalDataRoutingError";
  }
}

/** Throws when a personal-data task would go through the public key. */
export function assertRouteAllowed(
  task: AiTask,
  route: Pick<TaskRoute, "keyClass" | "personalData">,
): void {
  if (route.personalData && route.keyClass === "public") throw new PersonalDataRoutingError(task);
}

/**
 * Validates a whole table, e.g. one built from overrides, at boot: key classes, prompt names
 * against core's ROUTED_PROMPTS, and the embedding model the database vectors were built with.
 * Also refuses a key class that differs from DEFAULT_ROUTING, except "user" (a user's own key).
 */
export function validateRoutingTable(table: RoutingTable): RoutingTable {
  const routed: readonly string[] = ROUTED_PROMPTS;
  for (const task of AI_TASKS) {
    const route = table[task];
    assertRouteAllowed(task, route);
    const base = DEFAULT_ROUTING[task];
    if (route.keyClass !== base.keyClass && route.keyClass !== "user") {
      throw new Error(
        `[ai] Task "${task}" must use the ${base.keyClass} key, not ${route.keyClass}.`,
      );
    }
    if (route.personalData !== base.personalData || route.kind !== base.kind) {
      throw new Error(`[ai] Task "${task}" changes personalData or kind from DEFAULT_ROUTING.`);
    }
    if (route.promptName !== null && !routed.includes(route.promptName)) {
      throw new Error(
        `[ai] Task "${task}" uses prompt "${route.promptName}", not in ROUTED_PROMPTS.`,
      );
    }
    if (route.kind === "embedding" && route.model !== EMBEDDING_MODEL) {
      throw new Error(
        `[ai] Task "${task}" embeds with ${route.model}; stored vectors use ${EMBEDDING_MODEL}.`,
      );
    }
  }
  return table;
}

/**
 * DEFAULT_ROUTING with `routing.json` applied. A config sets only `model`, `fallbackModels` and
 * `params` (core's schema is strict); key class, personal-data flag, kind and prompt always come
 * from DEFAULT_ROUTING. The result is validated, so an embedding-model change is refused too.
 * A null config returns DEFAULT_ROUTING.
 */
export function applyRoutingConfig(config: RoutingConfig | null): RoutingTable {
  if (config === null) return DEFAULT_ROUTING;
  const table = Object.fromEntries(
    AI_TASKS.map((task) => {
      const base: TaskRoute = DEFAULT_ROUTING[task];
      const override = config.tasks[task];
      if (override === undefined) return [task, base];
      const route: TaskRoute = {
        ...base,
        model: override.model,
        fallbackModels: override.fallbackModels,
        ...(override.params === undefined ? {} : { params: override.params }),
      };
      return [task, route];
    }),
  ) as Record<AiTask, TaskRoute>;
  return validateRoutingTable(table);
}

let routingTable: Promise<RoutingTable> | undefined;

/**
 * The routing table from the process-wide private config (`routing.json`, else DEFAULT_ROUTING),
 * loaded once. Pass `loadConfig` to read another source. Call at boot so a bad file fails early.
 */
export function loadRoutingTable(
  loadConfig: () => Promise<RoutingConfig | null> = loadRoutingConfig,
): Promise<RoutingTable> {
  if (loadConfig !== loadRoutingConfig) return loadConfig().then(applyRoutingConfig);
  if (!routingTable) {
    routingTable = loadConfig().then(applyRoutingConfig);
    routingTable.catch(() => {
      routingTable = undefined;
    });
  }
  return routingTable;
}

export interface RouteOptions {
  /** Override the table's key class, e.g. "user" when a user brings their own key. */
  keyClass?: KeyClass;
  table?: RoutingTable;
}

export interface ResolvedRoute extends TaskRoute {
  task: AiTask;
}

export function resolveRoute(task: AiTask, options: RouteOptions = {}): ResolvedRoute {
  const base = (options.table ?? DEFAULT_ROUTING)[task];
  const route: ResolvedRoute = { ...base, task, keyClass: options.keyClass ?? base.keyClass };
  assertRouteAllowed(task, route);
  return route;
}

export type TaskModelOptions = RouteOptions & OpenRouterOptions;

type Provider = ReturnType<typeof getOpenRouter>;
export type TaskLanguageModel = ReturnType<Provider["chat"]>;
export type TaskEmbeddingModel = ReturnType<Provider["textEmbeddingModel"]>;

function expectKind(route: ResolvedRoute, kind: ModelKind): void {
  if (route.kind !== kind) {
    throw new Error(`[ai] Task "${route.task}" is a ${route.kind} task, not ${kind}.`);
  }
}

/** Chat model for a language task, on the right key, with fallbacks and ZDR where required. */
export function languageModelForTask(
  task: AiTask,
  options: TaskModelOptions = {},
): { model: TaskLanguageModel; route: ResolvedRoute } {
  const route = resolveRoute(task, options);
  expectKind(route, "language");
  const provider = getOpenRouter(route.keyClass, options);
  const model = provider.chat(
    route.model,
    route.fallbackModels.length > 0
      ? { extraBody: { models: [route.model, ...route.fallbackModels] } }
      : {},
  );
  return { model, route };
}

/**
 * Embedding model for an embedding task, on the right key, with ZDR where required. Requests
 * EMBEDDING_DIMENSIONS-d vectors to match the database `halfvec` columns. The OpenRouter
 * embedding model ignores `providerOptions`; `settings.extraBody` is spread into the request
 * body, so that is where `dimensions` goes.
 */
export function embeddingModelForTask(
  task: AiTask,
  options: TaskModelOptions = {},
): { model: TaskEmbeddingModel; route: ResolvedRoute } {
  const route = resolveRoute(task, options);
  expectKind(route, "embedding");
  const model = getOpenRouter(route.keyClass, options).textEmbeddingModel(route.model, {
    extraBody: { dimensions: EMBEDDING_DIMENSIONS },
  });
  return { model, route };
}
