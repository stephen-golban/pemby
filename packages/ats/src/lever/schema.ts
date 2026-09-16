// Response of the Lever Postings API list call (`/v0/postings/{site}?mode=json`): a bare array.
// Lenient: unknown fields are dropped, and everything except the identity fields may be missing.
import { z } from "zod";

export const leverSalaryRangeSchema = z.object({
  currency: z.string().nullish(),
  interval: z.string().nullish(),
  min: z.number().nullish(),
  max: z.number().nullish(),
});

export const leverPostingSchema = z.object({
  id: z.string(),
  text: z.string(),
  categories: z
    .object({
      location: z.string().nullish(),
      allLocations: z.array(z.string()).nullish(),
      team: z.string().nullish(),
      department: z.string().nullish(),
      commitment: z.string().nullish(),
    })
    .nullish(),
  description: z.string().nullish(),
  lists: z.array(z.object({ text: z.string().nullish(), content: z.string().nullish() })).nullish(),
  additional: z.string().nullish(),
  salaryDescription: z.string().nullish(),
  salaryRange: leverSalaryRangeSchema.nullish(),
  workplaceType: z.string().nullish(),
  hostedUrl: z.string(),
  applyUrl: z.string().nullish(),
  createdAt: z.number().nullish(),
});

export const leverListSchema = z.array(leverPostingSchema);

export type LeverPosting = z.infer<typeof leverPostingSchema>;
export type LeverSalaryRange = z.infer<typeof leverSalaryRangeSchema>;
