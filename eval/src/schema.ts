// File formats of the eligibility accuracy check (PLAN D24, phase 05 item 5).
//
// - A candidate is a public job post pulled from staging for the owner to label.
// - A label file (`eval/labels/<id>.json`) is one post's snapshot plus the expected tier for every
//   (country x way of working) pair. Snapshots are public post text; no applicant data.
import { ELIGIBILITY_TIERS } from "@pemby/core";
import { z } from "zod";

/** The ways of working the check covers. Local and paid programs are out of scope for now. */
export const EVAL_WAYS = ["b2b-contractor", "eor-employee"] as const;
export type EvalWay = (typeof EVAL_WAYS)[number];

/** Tricky-case buckets candidates are drawn from (PLAN tricky cases, research 02 section 4.4). */
export const BUCKETS = [
  "emea",
  "eu-work-authorization",
  "europe-region",
  "contractors-worldwide",
  "bare-remote",
  "country-list",
  "us-only",
  "latam-or-other-region",
  "timezone-only",
  "mentions-target-country",
  "onsite-hybrid-elsewhere",
] as const;
export type Bucket = (typeof BUCKETS)[number];

export const tierSchema = z.enum(ELIGIBILITY_TIERS);
export const waySchema = z.enum(EVAL_WAYS);
export const bucketSchema = z.enum(BUCKETS);
/** Labeling session number. Session 3+ is a holdout: never tuned against, pulled once. */
export const sessionSchema = z.number().int().positive();
/** ISO 3166-1 alpha-2, upper case. */
export const countrySchema = z.string().regex(/^[A-Z]{2}$/, "ISO 3166-1 alpha-2, upper case");

/** URL-safe, stable across re-pulls of the same job. */
export const slugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "lower-case slug");

export const snapshotSchema = z.object({
  title: z.string().min(1),
  company: z.string().min(1),
  locations: z.array(z.string()),
  workplaceType: z.string().nullable(),
  employmentType: z.string().nullable(),
  /** Plain text of the public post as ingested, with emails and phone numbers replaced. */
  descriptionText: z.string(),
  capturedAt: z.iso.datetime({ offset: true }),
});
export type Snapshot = z.infer<typeof snapshotSchema>;

export const pairLabelSchema = z.object({
  country: countrySchema,
  wayOfWorking: waySchema,
  tier: tierSchema,
  note: z.string().optional(),
});
export type PairLabel = z.infer<typeof pairLabelSchema>;

export const labelFileSchema = z
  .object({
    id: slugSchema,
    jobId: z.uuid(),
    /** Public post URL on the ATS. */
    url: z.url(),
    /** ATS the post came from (jobs.source). */
    source: z.string().min(1),
    snapshot: snapshotSchema,
    category: bucketSchema,
    labels: z.array(pairLabelSchema).min(1),
    /**
     * `owner+lead`: the owner and the lead labeled directly. `ai-pair+lead`: two independent AI
     * labelers applied the owner-approved rubric, with disagreements adjudicated by the lead
     * (owner decision 2026-09-17, to save the owner's time).
     */
    labeledBy: z.enum(["owner+lead", "ai-pair+lead"]),
    labeledAt: z.iso.datetime({ offset: true }),
    session: sessionSchema,
  })
  .superRefine((file, ctx) => {
    const seen = new Set<string>();
    const countries = new Set<string>();
    for (const label of file.labels) {
      const key = `${label.country}/${label.wayOfWorking}`;
      if (seen.has(key)) {
        ctx.addIssue({ code: "custom", message: `duplicate label for ${key}`, path: ["labels"] });
      }
      seen.add(key);
      countries.add(label.country);
    }
    // Every (country x way) pair must be present for each labeled country.
    for (const country of countries) {
      for (const way of EVAL_WAYS) {
        if (!seen.has(`${country}/${way}`)) {
          ctx.addIssue({
            code: "custom",
            message: `missing label for ${country}/${way}`,
            path: ["labels"],
          });
        }
      }
    }
  });
export type LabelFile = z.infer<typeof labelFileSchema>;

export const candidateSchema = z.object({
  id: slugSchema,
  jobId: z.uuid(),
  url: z.url(),
  source: z.string().min(1),
  snapshot: snapshotSchema,
  category: bucketSchema,
  /** Which heuristic put the post in its bucket. */
  why: z.string(),
  /** Other buckets the post also matched. */
  alsoMatched: z.array(bucketSchema),
  /** Up to 6 short verbatim sentences about location, authorization, engagement or timezone. */
  keySpans: z.array(z.string()).max(6),
});
export type Candidate = z.infer<typeof candidateSchema>;

export const candidatesFileSchema = z.object({
  session: sessionSchema,
  generatedAt: z.iso.datetime({ offset: true }),
  seed: z.number().int(),
  countries: z.array(countrySchema).min(1),
  ways: z.array(waySchema).min(1),
  candidates: z.array(candidateSchema),
});
export type CandidatesFile = z.infer<typeof candidatesFileSchema>;
