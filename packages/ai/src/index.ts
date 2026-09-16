// `@pemby/ai`: server-only. OpenRouter key routing, task routing, cost cap types and
// prompt loading (prompts come from the private config, never from this repo).
export {
  AiConfigError,
  KEY_CLASSES,
  ZDR_PROVIDER_ROUTING,
  getOpenRouter,
  requiresZdr,
  withEnforcedZdr,
  type EnvLike,
  type KeyClass,
  type OpenRouterOptions,
} from "./keys";
export {
  AI_TASKS,
  DEFAULT_ROUTING,
  EMBEDDING_DIMENSIONS,
  EMBEDDING_MODEL,
  PersonalDataRoutingError,
  assertRouteAllowed,
  embeddingModelForTask,
  languageModelForTask,
  resolveRoute,
  validateRoutingTable,
  type AiTask,
  type ModelKind,
  type ResolvedRoute,
  type RouteOptions,
  type RoutingTable,
  type TaskEmbeddingModel,
  type TaskLanguageModel,
  type TaskModelOptions,
  type TaskRoute,
} from "./routing";
export {
  DAILY_CAP_USD,
  countsTowardDailyCap,
  evaluateDailyCap,
  type AiUsageEntry,
  type CostLedger,
  type DailyCapGuard,
  type DailyCapStatus,
} from "./cost";
export { loadPrompt, type PromptTemplate } from "@pemby/core/private-config";
