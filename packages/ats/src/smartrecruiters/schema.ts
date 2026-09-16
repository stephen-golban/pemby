// Shapes of SmartRecruiters' Posting API: the paged list and the single posting.
// Lenient: unknown fields are dropped, only what the mapper reads is checked.
import { z } from "zod";

const nullableString = z.string().nullish();
/** Label objects ({id,label}); `id` is a string in the list and a number in the detail. */
const labelled = z.object({ label: nullableString }).nullish();

export const smartrecruitersLocationSchema = z
  .object({
    city: nullableString,
    region: nullableString,
    country: nullableString,
    remote: z.boolean().nullish(),
    hybrid: z.boolean().nullish(),
    fullLocation: nullableString,
  })
  .nullish();

const postingBase = {
  id: z.union([z.string(), z.number()]),
  name: z.string(),
  releasedDate: nullableString,
  location: smartrecruitersLocationSchema,
  department: labelled,
  typeOfEmployment: labelled,
  experienceLevel: labelled,
};

export const smartrecruitersListSchema = z.object({
  offset: z.number(),
  limit: z.number(),
  totalFound: z.number(),
  content: z.array(z.object(postingBase)),
});

const sectionSchema = z.object({ title: nullableString, text: nullableString }).nullish();

export const smartrecruitersPostingSchema = z.object({
  ...postingBase,
  postingUrl: nullableString,
  applyUrl: nullableString,
  jobAd: z
    .object({
      sections: z
        .object({
          companyDescription: sectionSchema,
          jobDescription: sectionSchema,
          qualifications: sectionSchema,
          additionalInformation: sectionSchema,
        })
        .nullish(),
    })
    .nullish(),
  compensation: z
    .object({
      min: z.union([z.number(), z.string()]).nullish(),
      max: z.union([z.number(), z.string()]).nullish(),
      currency: nullableString,
      period: nullableString,
    })
    .nullish(),
});

export type SmartRecruitersListPosting = z.infer<
  typeof smartrecruitersListSchema
>["content"][number];
export type SmartRecruitersPosting = z.infer<typeof smartrecruitersPostingSchema>;
