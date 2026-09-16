// Response of the Greenhouse Job Board API list call
// (`/v1/boards/{token}/jobs?content=true&pay_transparency=true`). Lenient: unknown fields are
// dropped, and everything except the identity fields may be missing or null.
import { z } from "zod";

const namedSchema = z.object({ name: z.string().nullish() });

export const greenhousePayRangeSchema = z.object({
  min_cents: z.number().nullish(),
  max_cents: z.number().nullish(),
  currency_type: z.string().nullish(),
  title: z.string().nullish(),
});

export const greenhouseJobSchema = z.object({
  id: z.union([z.number(), z.string()]),
  title: z.string(),
  content: z.string().nullish(),
  absolute_url: z.string(),
  location: namedSchema.nullish(),
  offices: z.array(namedSchema).nullish(),
  departments: z.array(namedSchema).nullish(),
  metadata: z.array(z.object({ name: z.string().nullish(), value: z.unknown() })).nullish(),
  pay_input_ranges: z.array(greenhousePayRangeSchema).nullish(),
  first_published: z.string().nullish(),
  updated_at: z.string().nullish(),
});

export const greenhouseListSchema = z.object({ jobs: z.array(greenhouseJobSchema) });

export type GreenhouseJob = z.infer<typeof greenhouseJobSchema>;
export type GreenhousePayRange = z.infer<typeof greenhousePayRangeSchema>;
