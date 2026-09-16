// Task routing (PLAN D19). Model ids are public; prompts are private config.
import {
  AI_TASKS,
  EMBEDDING_DIMENSIONS,
  EMBEDDING_MODEL,
  REQUIRED_PROMPTS,
  type AiTask,
  type RequiredPromptName,
} from "@pemby/core";
import { getOpenRouter, type KeyClass, type OpenRouterOptions } from "./keys";

// Task names are shared with the `ai_task` enum in `@pemby/db`, and the embedding size with its
// `halfvec` columns, so both live in `@pemby/core`.
export { AI_TASKS, EMBEDDING_DIMENSIONS, EMBEDDING_MODEL, type AiTask } from "@pemby/core";

export type ModelKind = "language" | "embedding";

export interface TaskRoute {
  model: string;
  /** Sent as OpenRouter `models` so it falls back in order when the primary fails. */
  fallbackModels: readonly string[];
  keyClass: KeyClass;
  kind: ModelKind;
  /** Personal data (CVs, profiles, kits, CV embeddings) must never use the public key. */
  personalData: boolean;
  /**
   * Prompt file name in the private config, if the task uses one. Limited to core's
   * REQUIRED_PROMPTS, which the config loader checks at boot.
   */
  promptName: RequiredPromptName | null;
}

export type RoutingTable = Readonly<Record<AiTask, TaskRoute>>;

export const DEFAULT_ROUTING = {
  "job-enrichment": {
    model: "nvidia/nemotron-3-super-120b-a12b:free",
    fallbackModels: ["openai/gpt-oss-120b"],
    keyClass: "public",
    kind: "language",
    personalData: false,
    promptName: "job-enrichment",
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
  "application-kit": {
    model: "anthropic/claude-haiku-4.5",
    fallbackModels: [],
    keyClass: "private",
    kind: "language",
    personalData: true,
    promptName: "application-kit",
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
 * against core's REQUIRED_PROMPTS, and the embedding model the database vectors were built with.
 */
export function validateRoutingTable(table: RoutingTable): RoutingTable {
  const required: readonly string[] = REQUIRED_PROMPTS;
  for (const task of AI_TASKS) {
    const route = table[task];
    assertRouteAllowed(task, route);
    if (route.promptName !== null && !required.includes(route.promptName)) {
      throw new Error(
        `[ai] Task "${task}" uses prompt "${route.promptName}", not in REQUIRED_PROMPTS.`,
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
