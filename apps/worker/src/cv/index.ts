// CV drop (phase 06): extract, parse (./parse, builder B2) and cleanup jobs.
export {
  CV_ANON_TTL_DEFAULT_HOURS,
  readCvAnonTtlHours,
  readCvEnv,
  type CvBucketEnv,
  type CvEnv,
} from "./env";
export {
  CV_CLEANUP_CRON,
  CV_CLEANUP_QUEUE,
  CV_EXTRACT_QUEUE,
  CV_EXTRACT_TIMEOUT_MS,
  CV_PARSE_QUEUE,
  createCvQueues,
  type CvJobData,
} from "./queues";
export { createCvBucket, type CvBucket } from "./bucket";
export { extractCv, normalizeCvText, type ExtractOutcome } from "./extract";
export { runCvCleanup, type CvCleanupOptions, type CvCleanupResult } from "./cleanup";
export { safeErrorLabel, startCvWorkers, type CvWorkerDeps } from "./workers";
