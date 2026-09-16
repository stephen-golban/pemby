// Response of Ashby's public job posting API
// (`/posting-api/job-board/{name}?includeCompensation=true`). Lenient: unknown fields are dropped,
// and everything except the identity fields may be missing or null.
import { z } from "zod";

export const ashbyCompensationComponentSchema = z.object({
  summary: z.string().nullish(),
  compensationType: z.string().nullish(),
  interval: z.string().nullish(),
  currencyCode: z.string().nullish(),
  minValue: z.number().nullish(),
  maxValue: z.number().nullish(),
});

export const ashbyCompensationSchema = z.object({
  compensationTierSummary: z.string().nullish(),
  compensationTiers: z
    .array(z.object({ components: z.array(ashbyCompensationComponentSchema).nullish() }))
    .nullish(),
});

export const ashbyJobSchema = z.object({
  id: z.string(),
  title: z.string(),
  descriptionHtml: z.string().nullish(),
  location: z.string().nullish(),
  secondaryLocations: z.array(z.object({ location: z.string().nullish() })).nullish(),
  isRemote: z.boolean().nullish(),
  workplaceType: z.string().nullish(),
  department: z.string().nullish(),
  team: z.string().nullish(),
  employmentType: z.string().nullish(),
  compensation: ashbyCompensationSchema.nullish(),
  shouldDisplayCompensationOnJobPostings: z.boolean().nullish(),
  isListed: z.boolean().nullish(),
  jobUrl: z.string(),
  applyUrl: z.string().nullish(),
  publishedAt: z.string().nullish(),
});

export const ashbyBoardSchema = z.object({ jobs: z.array(ashbyJobSchema) });

export type AshbyJob = z.infer<typeof ashbyJobSchema>;
export type AshbyCompensation = z.infer<typeof ashbyCompensationSchema>;
