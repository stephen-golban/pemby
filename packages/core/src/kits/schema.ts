// The application kit's content: the shape the model returns, the bounds we hold it to, and the
// three sections the UI renders. Isomorphic — no DB types, no React, no `node:` imports.
//
// **This shape must agree with `KitContent` in `packages/db/src/schema/matching.ts`**, which types
// the `kits.content` jsonb column. It is declared independently rather than imported, because
// `@pemby/core` must not depend on `@pemby/db`: core is bundled into the browser and the db package
// pulls in `pg`. Two declarations of one shape is the price of that boundary; changing one without
// the other is a type error at the worker, which is the only place both are in scope.
//
// Validation is two steps, exactly as `../profile/schema.ts` does it for the parsed CV, and for the
// same reason learned there:
//
//   1. `kitContentSchema` checks **shape and types only**, with no `maxLength` and no `maxItems`.
//      Limits are stated in each `.describe()` for the model, never enforced by the JSON schema.
//      A schema that rejects one over-long bullet rejects the whole kit, and `runStructuredTask`
//      answers a rejection with a repair retry — so a cosmetic overrun would cost a second paid
//      model call, or a failed generation, instead of a slightly long bullet.
//   2. `normalizeKitContent` then enforces every limit in `KIT_LIMITS`: lists cut to length,
//      strings trimmed and capped, empty entries dropped.
//
// Store and render only the normalized result.

import { z } from "zod";

/**
 * The three sections, in render order. This is also the **copy-button boundary**: a person copies
 * one section at a time into an employer's form, so the sections are the unit the UI acts on.
 */
export const KIT_SECTIONS = ["cvBullets", "coverLetter", "screeningAnswers"] as const;
export type KitSection = (typeof KIT_SECTIONS)[number];

/**
 * Enforced by `normalizeKitContent`, never by the schema.
 *
 * The numbers are bounds on absurdity, not targets: they exist so a model that loops, pads or
 * answers a different question cannot write 200 bullets or a 40k-character letter into a jsonb
 * column and onto a page. A well-behaved kit is nowhere near any of them.
 */
export const KIT_LIMITS = {
  /** Bullets a person can actually paste into a CV without rewriting it. */
  cvBullets: 8,
  cvBulletChars: 300,
  /** About 450 words: a cover letter longer than this is not read by anyone. */
  coverLetterChars: 3_000,
  /** Matches `MAX_SCREENING_QUESTIONS` in `./input.ts`: one answer per question we passed in. */
  screeningAnswers: 10,
  screeningQuestionChars: 500,
  screeningAnswerChars: 1_500,
} as const;

const L = KIT_LIMITS;

export const kitScreeningAnswerSchema = z.object({
  question: z
    .string()
    .describe("The screening question from the post, copied as the post words it."),
  answer: z
    .string()
    .describe(`Answer in the candidate's voice, at most ${L.screeningAnswerChars} characters.`),
});

/**
 * Output schema of the `application-kit` task. Sent as a strict JSON schema, so every property is
 * required; "nothing to say" is an empty array or an empty string, never `optional()`.
 */
export const kitContentSchema = z.object({
  cvBullets: z
    .array(z.string())
    .describe(
      `CV bullets tailored to this post, at most ${L.cvBullets}, each at most ${L.cvBulletChars} characters. Only claims the CV supports.`,
    ),
  coverLetter: z
    .string()
    .describe(
      `Cover letter, at most ${L.coverLetterChars} characters. Plain text, no placeholders.`,
    ),
  screeningAnswers: z
    .array(kitScreeningAnswerSchema)
    .describe("One entry per screening question given in the input. Empty when none were given."),
});

/**
 * The kit as it is stored and rendered. Structurally identical to `KitContent` in `@pemby/db`.
 *
 * `readonly` is deliberate: nothing downstream edits a kit in place. The user edits their copy in
 * the employer's form — Pemby never submits anything (PLAN D9).
 */
export type KitContent = z.infer<typeof kitContentSchema>;
export type KitScreeningAnswer = z.infer<typeof kitScreeningAnswerSchema>;

/** Collapses runs of whitespace inside a single line, trims, and caps. */
function line(value: string, max: number): string {
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

/**
 * Caps prose without slicing mid-sentence when it can be avoided: cut to the limit, then back to
 * the last paragraph or sentence end, as long as that keeps at least 80% of the allowance. A hard
 * slice is the fallback, and it is still better than storing an unbounded string.
 */
function prose(value: string, max: number): string {
  const trimmed = value.replace(/[ \t]+\n/g, "\n").trim();
  if (trimmed.length <= max) return trimmed;
  const cut = trimmed.slice(0, max);
  const floor = Math.floor(max * 0.8);
  const boundary = Math.max(cut.lastIndexOf("\n"), cut.lastIndexOf(". "));
  return (boundary >= floor ? cut.slice(0, boundary + 1) : cut).trim();
}

/**
 * Every limit in `KIT_LIMITS`, applied. Total, so it can be handed a parsed-but-unbounded model
 * reply and return something safe to store.
 */
export function normalizeKitContent(content: KitContent): KitContent {
  const cvBullets = content.cvBullets
    .map((bullet) => line(bullet, L.cvBulletChars))
    .filter((bullet) => bullet.length > 0)
    .slice(0, L.cvBullets);

  const screeningAnswers = content.screeningAnswers
    .map((entry) => ({
      question: line(entry.question, L.screeningQuestionChars),
      answer: prose(entry.answer, L.screeningAnswerChars),
    }))
    .filter((entry) => entry.question.length > 0 && entry.answer.length > 0)
    .slice(0, L.screeningAnswers);

  return {
    cvBullets,
    coverLetter: prose(content.coverLetter, L.coverLetterChars),
    screeningAnswers,
  };
}
