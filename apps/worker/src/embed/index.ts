// Embeddings (phase 07): the embed queues, the sweep and the two handlers. `apps/worker/src/index.ts`
// wires exactly four names from here, shaped like their `enrich` equivalents: `readEmbedEnv()`,
// `createEmbedQueues(boss)`, `startEmbedWorkers({ boss, db, env })` and `scheduleEmbedSweep(boss, env)`.
export {
  EMBED_DAILY_BUDGET_DEFAULT_USD,
  readEmbedBudgetUsd,
  readEmbedEnv,
  type EmbedEnv,
} from "./env";
export {
  EMBED_JOB_QUEUE,
  EMBED_PROFILE_QUEUE,
  EMBED_SWEEP_CRON,
  EMBED_SWEEP_QUEUE,
  createEmbedQueues,
  type EmbedJobData,
  type EmbedProfileData,
} from "./queues";
export { assertEmbedBudget, embedSpentTodayUsd } from "./budget";
export {
  EMBED_TEXT_VERSION,
  JOB_EMBED_MAX_CHARS,
  JOB_POST_MAX_CHARS,
  PROFILE_EMBED_MAX_CHARS,
  buildJobEmbeddingText,
  buildProfileEmbeddingText,
  embeddingContentHash,
} from "./text";
export { embedJob, type EmbedDeps, type EmbedOutcome } from "./embed-job";
export { embedProfile } from "./embed-profile";
export {
  describeEmbedError,
  scheduleEmbedSweep,
  selectJobsToEmbed,
  selectProfilesToEmbed,
  startEmbedWorkers,
  sweepEmbed,
  type EmbedSweepResult,
  type EmbedWorkerDeps,
} from "./workers";
