export { createDb, db, getDb } from "./client";
export type { Db, Schema } from "./client";
export * as schema from "./schema";
export * from "./schema";

import type * as s from "./schema";

export type User = typeof s.user.$inferSelect;
export type Profile = typeof s.profiles.$inferSelect;
export type NewProfile = typeof s.profiles.$inferInsert;
export type CvFile = typeof s.cvFiles.$inferSelect;
export type NewCvFile = typeof s.cvFiles.$inferInsert;
export type RateLimit = typeof s.rateLimits.$inferSelect;
export type PendingClaim = typeof s.pendingClaims.$inferSelect;
export type NewPendingClaim = typeof s.pendingClaims.$inferInsert;
export type Company = typeof s.companies.$inferSelect;
export type Job = typeof s.jobs.$inferSelect;
export type NewJob = typeof s.jobs.$inferInsert;
export type JobEnrichment = typeof s.jobEnrichment.$inferSelect;
export type JobEligibility = typeof s.jobEligibility.$inferSelect;
export type EligibilityEvidence = typeof s.eligibilityEvidence.$inferSelect;
export type NewEligibilityEvidence = typeof s.eligibilityEvidence.$inferInsert;
export type NewJobEnrichment = typeof s.jobEnrichment.$inferInsert;
export type NewJobEligibility = typeof s.jobEligibility.$inferInsert;
export type Match = typeof s.matches.$inferSelect;
export type NewMatch = typeof s.matches.$inferInsert;
export type Application = typeof s.applications.$inferSelect;
export type NewApplication = typeof s.applications.$inferInsert;
export type Flag = typeof s.flags.$inferSelect;
export type NewFlag = typeof s.flags.$inferInsert;
export type Kit = typeof s.kits.$inferSelect;
export type NewKit = typeof s.kits.$inferInsert;
export type AiUsage = typeof s.aiUsage.$inferSelect;
export type NewAiUsage = typeof s.aiUsage.$inferInsert;
export type AiCapAlert = typeof s.aiCapAlerts.$inferSelect;
export type UserAiKey = typeof s.userAiKeys.$inferSelect;
export type NewUserAiKey = typeof s.userAiKeys.$inferInsert;
export type Pass = typeof s.passes.$inferSelect;
export type Payment = typeof s.payments.$inferSelect;
export type Referral = typeof s.referrals.$inferSelect;
export type Channel = typeof s.channels.$inferSelect;
export type TelegramLinkToken = typeof s.telegramLinkTokens.$inferSelect;
export type DeliveryLog = typeof s.deliveryLog.$inferSelect;
export type CompanySourceHealth = typeof s.companySourceHealth.$inferSelect;

export {
  countOpenJobsByRoleFamily,
  getSourceHealth,
  type BoardStatus,
  type SourceHealth,
  type SourceHealthRow,
  type SourceHealthTotals,
} from "./queries/source-health";

export {
  aiUsageTotals,
  claimCapAlert,
  createAiUsageLedger,
  markCapAlertDelivered,
  type AiUsageLedger,
  type AiUsageTotalsFilter,
  type AiUsageTotalsRow,
  type CapAlertClaim,
  type CapAlertDelivery,
} from "./queries/ai-usage";

export {
  countNearMissesByBlocker,
  jobSimilarity,
  retireStaleMatches,
  selectBrief,
  selectMatchCandidateJobs,
  selectMatchCandidateUsers,
  upsertMatches,
  type Brief,
  type BriefMatch,
  type BriefParams,
  type DbEmploymentType,
  type DbPayPeriod,
  type DbSeniority,
  type DbWayOfWorking,
  type EligibilityTier,
  type EngineReasonKey,
  type JobSimilarity,
  type JobSimilarityParams,
  type MatchCandidateJob,
  type MatchCandidateJobParams,
  type MatchCandidateUser,
  type MatchCandidateUserParams,
  type MatchGate,
  type MatchKind,
  type MatchPassReason,
  type MatchState,
  type MatchUpsertRow,
  type NearMissCount,
  type RetiredMatches,
  type RetireStaleMatchesParams,
  type ScoringNudges,
} from "./queries/matching";

export {
  claimDelivery,
  clearChannelDead,
  consumeTelegramLinkToken,
  countDeliveries,
  CLAIM_EXPIRED_ERROR,
  DEFAULT_MAX_DELIVERY_ATTEMPTS,
  DEFAULT_MAX_DELIVERY_SKIPS,
  DEFAULT_STALE_CLAIM_MS,
  deleteExpiredTelegramLinkTokens,
  deliveryPausedAt,
  failDelivery,
  LINK_TOKEN_TTL_MS,
  markChannelDead,
  MIN_STALE_CLAIM_MS,
  markMatchDelivered,
  mintTelegramLinkToken,
  reclaimStaleDeliveries,
  recordDeliverySent,
  selectDeliverableChannels,
  selectDueMatches,
  setDeliveryPaused,
  skipDelivery,
  type ChannelType,
  type ClaimDeliveryParams,
  type DeliveryChannel,
  type DeliveryPauseResult,
  type DeliveryClaim,
  type DueMatch,
  type DueMatchesParams,
  type FinishDeliveryParams,
  type MintedLinkToken,
  type RecordSentParams,
  type RecordSentResult,
} from "./queries/delivery";

export {
  countKitsThisMonth,
  insertKit,
  insertKitWithinQuota,
  listKits,
  selectKit,
  selectKitById,
  type KitInsertResult,
  type KitQuotaParams,
  type KitSummary,
  type SelectKitByIdParams,
  type SelectKitParams,
} from "./queries/kits";

export {
  selectTracker,
  setApplicationState,
  upsertApplication,
  type ApplicationState,
  type SetApplicationStateParams,
  type TrackerRow,
} from "./queries/applications";

export {
  claimFlagsToProcess,
  closeJob,
  countIndependentFlags,
  DEFAULT_FLAG_CLAIM_STALE_MS,
  DEFAULT_MAX_FLAG_CLAIM_ATTEMPTS,
  deleteFlagEvidence,
  MIN_FLAG_CLAIM_ATTEMPTS,
  MIN_FLAG_CLAIM_STALE_MS,
  quarantineJob,
  recordFlagAction,
  recordFlagOutcome,
  releaseJob,
  type ClaimFlagsParams,
  type CountIndependentFlagsParams,
  type EvidenceSource,
  type EvidenceTier,
  type EvidenceWayOfWorking,
  type FlagAction,
  type FlagActor,
  type FlagEvidenceRow,
  type FlagField,
  type FlagReason,
  type FlagStatus,
  type FlagOutcome,
  type FlagToProcess,
  type IndependentFlagCount,
  type JobStatus,
  type RecordFlagActionParams,
  type RecordFlagOutcomeParams,
  type TerminalFlagStatus,
} from "./queries/flags";

export {
  deleteUserAiKey,
  loadUserAiKey,
  markUserAiKeyUsed,
  selectUserAiKeyStatus,
  upsertUserAiKey,
  type LoadedUserAiKey,
  type UpsertUserAiKeyParams,
  type UserAiKeyStatus,
} from "./queries/user-keys";

export {
  REVIEW_QUEUE_STATUSES,
  selectDeliveryFailures,
  selectFlagForOwner,
  selectFlagsForReview,
  selectQuarantinedJobs,
  type DeliveryFailureRow,
  type FlagAutomationState,
  type FlagReviewOrder,
  type FlagReviewParams,
  type FlagReviewRow,
  type QuarantinedJobRow,
} from "./queries/admin";
