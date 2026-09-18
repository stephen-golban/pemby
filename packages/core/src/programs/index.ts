// `@pemby/core/programs`: the programs calendar (PLAN D11). Data lives at `data/programs/
// programs.json`, edited by PR (see `data/programs/README.md`). This module validates it with
// zod and exposes typed accessors. Isomorphic: a static JSON import, no `node:fs`, so it is safe
// for both server code and (if ever needed) the browser bundle.
import { z } from "zod";
import data from "../../../../data/programs/programs.json" with { type: "json" };

/** True only if `value` is a real calendar date, e.g. rejects 2026-02-30 (which `Date.parse` silently rolls to Mar 2). */
function isRealCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [, yearStr, monthStr, dayStr] = match;
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  const roundTrip = new Date(Date.UTC(year, month - 1, day));
  return (
    roundTrip.getUTCFullYear() === year &&
    roundTrip.getUTCMonth() === month - 1 &&
    roundTrip.getUTCDate() === day
  );
}

const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "expected an ISO date (YYYY-MM-DD)")
  .refine(isRealCalendarDate, "not a valid calendar date");

const httpsUrlSchema = z
  .url()
  .refine((value) => value.startsWith("https://"), "source URLs must be https");

export const PROGRAM_KINDS = ["mentorship", "internship", "graduate-role", "fellowship"] as const;
export type ProgramKind = (typeof PROGRAM_KINDS)[number];

export const STIPEND_KINDS = ["flat", "per-country", "not-disclosed", "education-credit"] as const;
export type StipendKind = (typeof STIPEND_KINDS)[number];

/** ISO 3166-1 alpha-2 code, or a free-text region label carrying its own note (e.g. "UA-occupied DNR/LNR"). */
const excludedCountrySchema = z.string().min(2).max(64);

export const programWindowSchema = z
  .object({
    label: z.string().min(1),
    opens: isoDateSchema.nullable(),
    closes: isoDateSchema.nullable(),
    starts: isoDateSchema.nullable(),
    ends: isoDateSchema.nullable(),
    /** Free-text recurrence rule, e.g. "mid-January for the Mar 1 term". Null for a one-off window. */
    recurring: z.string().min(1).nullable(),
    /** False for a pattern inferred from past years rather than stated by the primary source. */
    confirmed: z.boolean(),
  })
  .superRefine((value, ctx) => {
    if (value.opens && value.closes && value.opens > value.closes) {
      ctx.addIssue({
        code: "custom",
        path: ["closes"],
        message: "opens must be on or before closes",
      });
    }
    if (value.starts && value.ends && value.starts > value.ends) {
      ctx.addIssue({
        code: "custom",
        path: ["ends"],
        message: "starts must be on or before ends",
      });
    }
  });
export type ProgramWindow = z.infer<typeof programWindowSchema>;

export const stipendSchema = z.object({
  kind: z.enum(STIPEND_KINDS),
  currency: z.string().length(3).nullable(),
  amount: z.number().nonnegative().nullable(),
  byCountry: z.record(z.string().length(2), z.number().nonnegative()).nullable(),
  notes: z.string().min(1).nullable(),
});
export type Stipend = z.infer<typeof stipendSchema>;

export const eligibilitySchema = z.object({
  summary: z.string().min(1),
  minAge: z.number().int().positive().nullable(),
  excludedCountries: z.array(excludedCountrySchema),
  constraints: z.array(z.string().min(1)),
});
export type Eligibility = z.infer<typeof eligibilitySchema>;

export const programSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "id must be kebab-case"),
  name: z.string().min(1),
  organization: z.string().min(1),
  kind: z.enum(PROGRAM_KINDS),
  remote: z.boolean(),
  eligibility: eligibilitySchema,
  stipend: stipendSchema,
  windows: z.array(programWindowSchema),
  sourceUrls: z.array(httpsUrlSchema).min(1),
  lastChecked: isoDateSchema,
});
export type Program = z.infer<typeof programSchema>;

export const programsFileSchema = z
  .object({
    version: z.string().min(1),
    programs: z.array(programSchema),
  })
  .superRefine((value, ctx) => {
    const seen = new Set<string>();
    value.programs.forEach((program, index) => {
      if (seen.has(program.id)) {
        ctx.addIssue({
          code: "custom",
          path: ["programs", index, "id"],
          message: `duplicate program id "${program.id}"`,
        });
      }
      seen.add(program.id);
    });
  });
export type ProgramsFile = z.infer<typeof programsFileSchema>;

/** Validates and returns the programs calendar. Throws a `ZodError` if `programs.json` is malformed. */
export function loadPrograms(): ProgramsFile {
  return programsFileSchema.parse(data);
}

/**
 * Windows across `programs` whose `opens` date falls within `[now, now + withinDays]`, sorted by
 * `opens` ascending. A window with `opens: null` never matches (its opening date is unknown).
 */
export function upcomingWindows(
  programs: readonly Program[],
  now: Date,
  withinDays: number,
): Array<{ program: Program; window: ProgramWindow }> {
  const start = now.getTime();
  const end = start + withinDays * 24 * 60 * 60 * 1000;

  const matches: Array<{ program: Program; window: ProgramWindow }> = [];
  for (const program of programs) {
    for (const window of program.windows) {
      if (!window.opens) continue;
      const opensAt = Date.parse(window.opens);
      if (opensAt >= start && opensAt <= end) {
        matches.push({ program, window });
      }
    }
  }

  matches.sort(
    (a, b) => Date.parse(a.window.opens as string) - Date.parse(b.window.opens as string),
  );
  return matches;
}

export {
  PROGRAM_REASONS,
  allPrograms,
  nextProgramSteps,
  parseRecurrence,
  type ProgramNextStep,
  type ProgramNextStepsInput,
  type ProgramReason,
  type ProgramReasonKey,
  type ProgramStepKind,
} from "./next-steps";
