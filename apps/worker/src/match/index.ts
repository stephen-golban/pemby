// The matcher (phase 07): three queues, the sweep, the two fan-out directions and the pure pair
// evaluation both of them share. `apps/worker/src/index.ts` wires four names from here, shaped like
// their `enrich` and `embed` equivalents: `readMatchEnv()`, `createMatchQueues(boss)`,
// `startMatchWorkers({ boss, db, env })` and `scheduleMatchSweep(boss, env)`.
//
// Matching never calls a model (PLAN D18): rules, embeddings that another module wrote, and
// templated reasons. `@pemby/ai` is not a dependency of this module.
export { readMatchEnv, type MatchEnv } from "./env";
export {
  MATCH_JOB_QUEUE,
  MATCH_PROFILE_QUEUE,
  MATCH_SWEEP_CRON,
  MATCH_SWEEP_QUEUE,
  createMatchQueues,
  type MatchJobData,
  type MatchProfileData,
} from "./queues";
export {
  activePasses,
  jobRedFlags,
  matchJobRow,
  matchProfileRow,
  profileSimilarity,
  userDomains,
  type MatchJobRow,
  type MatchProfileRow,
} from "./db";
export {
  TOP_PAIRS,
  evaluatePair,
  formatTally,
  newTally,
  tally,
  type EvaluateInput,
  type EvaluateResult,
  type EvaluateSkip,
  type JobFacts,
  type MatchTally,
  type ScoredPair,
  type UserFacts,
} from "./evaluate";
export {
  candidateSeniorities,
  coreTimezone,
  jobFactsFromCandidate,
  jobFactsFromRow,
  userFactsFromCandidate,
  userFactsFromProfile,
  withinFreshnessWindow,
} from "./map";
export {
  MATCH_TIER_BAND,
  USER_PAGE_SIZE,
  formatMatchJob,
  matchOneJob,
  type MatchJobDeps,
  type MatchJobOutcome,
} from "./match-job";
export {
  formatMatchProfile,
  matchOneProfile,
  type MatchProfileDeps,
  type MatchProfileOutcome,
} from "./match-profile";
export {
  MATCH_RETRY_AFTER_HOURS,
  selectJobsToMatch,
  sweepMatch,
  type MatchSweepResult,
} from "./sweep";
export {
  describeMatchError,
  scheduleMatchSweep,
  startMatchWorkers,
  type MatchWorkerDeps,
} from "./workers";
