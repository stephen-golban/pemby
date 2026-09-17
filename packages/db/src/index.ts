export { createDb, db, getDb } from "./client";
export type { Db, Schema } from "./client";
export * as schema from "./schema";
export * from "./schema";

import type * as s from "./schema";

export type User = typeof s.user.$inferSelect;
export type Profile = typeof s.profiles.$inferSelect;
export type NewProfile = typeof s.profiles.$inferInsert;
export type CvFile = typeof s.cvFiles.$inferSelect;
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
export type Flag = typeof s.flags.$inferSelect;
export type Kit = typeof s.kits.$inferSelect;
export type AiUsage = typeof s.aiUsage.$inferSelect;
export type NewAiUsage = typeof s.aiUsage.$inferInsert;
export type AiCapAlert = typeof s.aiCapAlerts.$inferSelect;
export type Pass = typeof s.passes.$inferSelect;
export type Payment = typeof s.payments.$inferSelect;
export type Referral = typeof s.referrals.$inferSelect;
export type Channel = typeof s.channels.$inferSelect;
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
