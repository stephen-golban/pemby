// Shape of Workable's public widget endpoint (apply.workable.com/api/v1/widget/accounts/{sub}).
// Lenient: unknown fields are dropped, only what the mapper reads is checked.
import { z } from "zod";

const nullableString = z.string().nullish();

export const workableLocationSchema = z.object({
  country: nullableString,
  countryCode: nullableString,
  city: nullableString,
  region: nullableString,
  hidden: z.boolean().nullish(),
});

export const workableJobSchema = z.object({
  shortcode: z.string().min(1),
  title: z.string(),
  description: nullableString,
  employment_type: nullableString,
  department: nullableString,
  telecommuting: z.boolean().nullish(),
  /** Documented (`on_site|hybrid|remote`) but absent on the accounts checked 2026-09-16. */
  workplace_type: nullableString,
  url: nullableString,
  shortlink: nullableString,
  application_url: nullableString,
  published_on: nullableString,
  created_at: nullableString,
  country: nullableString,
  state: nullableString,
  city: nullableString,
  locations: z.array(workableLocationSchema).nullish(),
});

export const workableAccountSchema = z.object({
  name: nullableString,
  jobs: z.array(workableJobSchema),
});

export type WorkableJob = z.infer<typeof workableJobSchema>;
export type WorkableLocation = z.infer<typeof workableLocationSchema>;
