// `@pemby/ai`: server-only. OpenRouter key routing, task routing (private `routing.json` over
// DEFAULT_ROUTING), structured task calls, the cost ledger contract, the daily cap and its owner
// alert, and prompt loading (prompts come from the private config, never from this repo).
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
  applyRoutingConfig,
  assertRouteAllowed,
  embeddingModelForTask,
  languageModelForTask,
  loadRoutingTable,
  resolveRoute,
  validateRoutingTable,
  type AiTask,
  type ModelKind,
  type ResolvedRoute,
  type RouteOptions,
  type RoutingConfig,
  type RoutingTable,
  type TaskParams,
  type TaskEmbeddingModel,
  type TaskLanguageModel,
  type TaskModelOptions,
  type TaskRoute,
} from "./routing";
export {
  DAILY_CAP_USD,
  DailyCapReachedError,
  countsTowardDailyCap,
  createDailyCapGuard,
  evaluateDailyCap,
  nextUtcMidnight,
  readDailyCapUsd,
  utcDay,
  type AiUsageEntry,
  type CostLedger,
  type DailyCapGuard,
  type DailyCapGuardOptions,
  type DailyCapStatus,
} from "./cost";
export {
  AiEmbeddingInvalidError,
  EMBEDDING_BATCH_SIZE,
  EMBEDDING_MAX_REQUEST_CHARS,
  EMBEDDING_MAX_VALUE_CHARS,
  chunkEmbeddingValues,
  runEmbeddingTask,
  type EmbeddingTaskContext,
  type EmbeddingTaskOptions,
  type EmbeddingTaskResult,
} from "./embeddings";
export {
  AiCallError,
  AiOutputInvalidError,
  AiPromptMissingError,
  PAYMENT_LIMIT_SOURCES,
  paymentRequiredKindOf,
  runStreamingStructuredTask,
  runStructuredTask,
  type PaymentLimitSource,
  type PaymentRequiredKind,
  type RouteOverride,
  type StreamingPartialMeta,
  type StreamingStructuredTaskOptions,
  type StreamingStructuredTaskResult,
  type StructuredTaskContext,
  type StructuredTaskOptions,
  type StructuredTaskResult,
} from "./structured";
export { UserKeyError, type UserKeyErrorReason } from "./errors";
export {
  USER_KEY_SECRET_VAR,
  USER_KEY_VERSION,
  assertUserKeySecret,
  decryptUserKey,
  encryptUserKey,
  userKeyHash,
} from "./user-key";
export {
  estimateAttemptCost,
  estimateCostUsd,
  lookupGenerationUsage,
  type CostEstimate,
  type GenerationUsage,
} from "./usage";
export {
  alertOwnerCapReached,
  type CapAlertChannel,
  type CapAlertClaim,
  type CapAlertClaimInput,
  type CapAlertMarkDelivered,
  type CapAlertOptions,
  type CapAlertResult,
} from "./alert";
export { loadPrompt, type PromptTemplate } from "@pemby/core/private-config";
