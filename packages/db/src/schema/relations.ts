// Relations for Drizzle's relational query API (`db.query.*`). No SQL is generated from these.
import { relations } from "drizzle-orm";
import { aiUsage } from "./ai";
import { user } from "./auth";
import { passes, payments, referrals } from "./billing";
import { channels, deliveryLog } from "./delivery";
import { eligibilityEvidence, flags } from "./flags";
import {
  companies,
  companySourceHealth,
  jobEligibility,
  jobEmbeddings,
  jobEnrichment,
  jobs,
} from "./jobs";
import { applications, kits, matches } from "./matching";
import { cvFiles, pendingClaims, profileEmbeddings, profiles } from "./profiles";

export const userDomainRelations = relations(user, ({ one, many }) => ({
  profile: one(profiles, { fields: [user.id], references: [profiles.userId] }),
  cvFiles: many(cvFiles),
  matches: many(matches),
  applications: many(applications),
  kits: many(kits),
  passes: many(passes),
  payments: many(payments),
  channels: many(channels),
}));

export const profilesRelations = relations(profiles, ({ one }) => ({
  user: one(user, { fields: [profiles.userId], references: [user.id] }),
  embedding: one(profileEmbeddings),
}));

export const profileEmbeddingsRelations = relations(profileEmbeddings, ({ one }) => ({
  profile: one(profiles, { fields: [profileEmbeddings.profileId], references: [profiles.id] }),
}));

export const cvFilesRelations = relations(cvFiles, ({ one }) => ({
  user: one(user, { fields: [cvFiles.userId], references: [user.id] }),
}));

export const pendingClaimsRelations = relations(pendingClaims, ({ one }) => ({
  anonymousUser: one(user, { fields: [pendingClaims.anonymousUserId], references: [user.id] }),
  newUser: one(user, { fields: [pendingClaims.newUserId], references: [user.id] }),
}));

export const companiesRelations = relations(companies, ({ one, many }) => ({
  jobs: many(jobs),
  evidence: many(eligibilityEvidence),
  sourceHealth: one(companySourceHealth),
}));

export const companySourceHealthRelations = relations(companySourceHealth, ({ one }) => ({
  company: one(companies, {
    fields: [companySourceHealth.companyId],
    references: [companies.id],
  }),
}));

export const jobsRelations = relations(jobs, ({ one, many }) => ({
  company: one(companies, { fields: [jobs.companyId], references: [companies.id] }),
  enrichment: one(jobEnrichment),
  embedding: one(jobEmbeddings),
  eligibility: many(jobEligibility),
  evidence: many(eligibilityEvidence),
  matches: many(matches),
  flags: many(flags),
}));

export const jobEnrichmentRelations = relations(jobEnrichment, ({ one }) => ({
  job: one(jobs, { fields: [jobEnrichment.jobId], references: [jobs.id] }),
}));

export const jobEmbeddingsRelations = relations(jobEmbeddings, ({ one }) => ({
  job: one(jobs, { fields: [jobEmbeddings.jobId], references: [jobs.id] }),
}));

export const jobEligibilityRelations = relations(jobEligibility, ({ one }) => ({
  job: one(jobs, { fields: [jobEligibility.jobId], references: [jobs.id] }),
}));

export const eligibilityEvidenceRelations = relations(eligibilityEvidence, ({ one }) => ({
  job: one(jobs, { fields: [eligibilityEvidence.jobId], references: [jobs.id] }),
  company: one(companies, {
    fields: [eligibilityEvidence.companyId],
    references: [companies.id],
  }),
  flag: one(flags, { fields: [eligibilityEvidence.flagId], references: [flags.id] }),
}));

export const flagsRelations = relations(flags, ({ one }) => ({
  job: one(jobs, { fields: [flags.jobId], references: [jobs.id] }),
  user: one(user, { fields: [flags.userId], references: [user.id] }),
}));

export const matchesRelations = relations(matches, ({ one, many }) => ({
  user: one(user, { fields: [matches.userId], references: [user.id] }),
  job: one(jobs, { fields: [matches.jobId], references: [jobs.id] }),
  deliveries: many(deliveryLog),
}));

export const applicationsRelations = relations(applications, ({ one }) => ({
  user: one(user, { fields: [applications.userId], references: [user.id] }),
  job: one(jobs, { fields: [applications.jobId], references: [jobs.id] }),
  match: one(matches, { fields: [applications.matchId], references: [matches.id] }),
}));

export const kitsRelations = relations(kits, ({ one }) => ({
  user: one(user, { fields: [kits.userId], references: [user.id] }),
  job: one(jobs, { fields: [kits.jobId], references: [jobs.id] }),
  match: one(matches, { fields: [kits.matchId], references: [matches.id] }),
}));

export const aiUsageRelations = relations(aiUsage, ({ one }) => ({
  user: one(user, { fields: [aiUsage.userId], references: [user.id] }),
  job: one(jobs, { fields: [aiUsage.jobId], references: [jobs.id] }),
  company: one(companies, { fields: [aiUsage.companyId], references: [companies.id] }),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  user: one(user, { fields: [payments.userId], references: [user.id] }),
}));

export const passesRelations = relations(passes, ({ one }) => ({
  user: one(user, { fields: [passes.userId], references: [user.id] }),
  payment: one(payments, { fields: [passes.paymentId], references: [payments.id] }),
  referral: one(referrals, { fields: [passes.referralId], references: [referrals.id] }),
}));

export const channelsRelations = relations(channels, ({ one }) => ({
  user: one(user, { fields: [channels.userId], references: [user.id] }),
}));

export const deliveryLogRelations = relations(deliveryLog, ({ one }) => ({
  user: one(user, { fields: [deliveryLog.userId], references: [user.id] }),
  match: one(matches, { fields: [deliveryLog.matchId], references: [matches.id] }),
  channel: one(channels, { fields: [deliveryLog.channelId], references: [channels.id] }),
}));
