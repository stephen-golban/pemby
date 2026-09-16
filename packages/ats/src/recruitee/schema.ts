// Shape of Recruitee's Careers Site API offer list ({company}.recruitee.com/api/offers/).
// Lenient: unknown fields are dropped, only what the mapper reads is checked.
import { z } from "zod";

const nullableString = z.string().nullish();
/** Salary bounds arrive as strings ("2850") on live boards; accept numbers too. */
const amount = z.union([z.string(), z.number()]).nullish();

export const recruiteeLocationSchema = z.object({
  name: nullableString,
  city: nullableString,
  state: nullableString,
  country: nullableString,
});

export const recruiteeOfferSchema = z.object({
  id: z.union([z.number(), z.string()]),
  slug: nullableString,
  title: z.string(),
  status: nullableString,
  description: nullableString,
  requirements: nullableString,
  location: nullableString,
  city: nullableString,
  country: nullableString,
  locations: z.array(recruiteeLocationSchema).nullish(),
  remote: z.boolean().nullish(),
  hybrid: z.boolean().nullish(),
  on_site: z.boolean().nullish(),
  department: nullableString,
  employment_type_code: nullableString,
  salary: z
    .object({
      min: amount,
      max: amount,
      period: nullableString,
      currency: nullableString,
    })
    .nullish(),
  careers_url: nullableString,
  careers_apply_url: nullableString,
  created_at: nullableString,
  published_at: nullableString,
  updated_at: nullableString,
});

export const recruiteeOffersSchema = z.object({
  offers: z.array(recruiteeOfferSchema),
});

export type RecruiteeOffer = z.infer<typeof recruiteeOfferSchema>;
