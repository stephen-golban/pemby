// Job enrichment (phase 05): queues, sweep, handler and the pieces enrich:once reuses.
export { readEnrichEnv, type EnrichEnv } from "./env";
export {
  ENRICH_JOB_QUEUE,
  ENRICH_SWEEP_CRON,
  ENRICH_SWEEP_QUEUE,
  createEnrichQueues,
  type EnrichJobData,
} from "./queues";
export {
  ENRICH_CALL_TIMEOUT_MS,
  ENRICH_WAYS,
  computeEnrichment,
  countEnrichedJobs,
  loadCompanyEvidence,
  postOf,
  recomputeEligibilityForCompany,
  rulesOf,
  sampleSlotAvailable,
  tierSummary,
  writeEnrichment,
  type ComputeResult,
  type EnrichDeps,
  type EnrichmentComputation,
  type JobText,
  type SkipReason,
  type WriteSummary,
} from "./enrich-job";
export {
  alertCapReached,
  describeEnrichError,
  scheduleEnrichSweep,
  selectJobsToEnrich,
  startEnrichWorkers,
  sweepEnrich,
  type EnrichWorkerDeps,
  type SweepResult,
} from "./workers";
