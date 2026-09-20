// The flag rules (PLAN section 6, phase 09). `apps/worker/src/index.ts` wires exactly four names
// from here, shaped like their `embed` and `enrich` equivalents: `readFlagsEnv()`,
// `createFlagQueues(boss)`, `startFlagWorkers({ boss, db, env, http })` and
// `scheduleFlagSweep(boss, env)`.
export { FLAG_CLAIM_STALE_DEFAULT_MINUTES, readFlagsEnv, type FlagsEnv } from "./env";
export {
  FLAG_PROCESS_QUEUE,
  FLAG_SWEEP_CRON,
  FLAG_SWEEP_QUEUE,
  createFlagQueues,
  type FlagProcessData,
} from "./queues";
export { loadFlagForRule } from "./load";
export {
  FLAG_ACCOUNT_YOUNG_HOURS,
  FLAG_BASE_ESTABLISHED,
  FLAG_BASE_PASS_HOLDER,
  FLAG_BASE_YOUNG,
  FLAG_BURST_FREE,
  FLAG_WEIGHT_MAX,
  FLAG_WEIGHT_MIN,
  FLAG_WEIGHT_NEW_ACCOUNT,
  FLAG_WEIGHT_ORPHANED_MAX,
  reweighOpenFlags,
  type ReweighResult,
} from "./weight";
export {
  FLAG_CONSENSUS_WEIGHT,
  FLAG_REVIEW_WEIGHT,
  ruleClosedOrFake,
  ruleDuplicate,
  ruleFor,
  ruleNotHiringFromCountry,
  ruleOther,
  ruleScam,
  ruleWrongDetails,
  type RuleDeps,
  type RuleResult,
} from "./rules";
export {
  processFlag,
  scheduleFlagSweep,
  startFlagWorkers,
  sweepFlags,
  type FlagSweepResult,
  type FlagWorkerDeps,
} from "./workers";
