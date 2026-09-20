// Screening questions, found in a job post's own text.
//
// Pure, isomorphic, and deliberately a **heuristic over public text rather than a model call**.
// Nothing in the database holds a post's screening questions: `job_enrichment` extracts seniority,
// stack, salary and eligibility rules and nothing that looks like a question, and no ATS field in
// the ingest path carries them either. So either a kit answers no screening questions at all, or
// this file guesses, and a guess that is shown to the reader beside its answer is honest in a way
// a hidden one would not be: the kit surface prints each question above the answer it produced, so
// a bad pick is visible and ignorable rather than silently shaping a cover letter.
//
// Two rules keep the guess narrow:
//
//  1. **It must end in a question mark**, on its own line or as the tail of one.
//  2. **It must open with one of a fixed set of stems** that belong to application forms rather
//     than to marketing copy. Without this, "Ready to join a fast-growing team?" is a screening
//     question, and the model dutifully writes an answer to an advertisement.
//
// The input is `jobs.raw_text`, which is a public job advertisement. No personal data passes
// through here, and free text a user typed into a flag never reaches this file — nothing calls it
// with anything but the post.

import { MAX_SCREENING_QUESTIONS, MAX_SCREENING_QUESTION_CHARS } from "@pemby/core";

/**
 * Openings that mark a line as a question the applicant is being asked, rather than a rhetorical
 * one the advertisement is asking itself. Matched case-insensitively at the start of the line,
 * after any bullet, number or dash has been stripped.
 */
const STEMS = [
  "do you",
  "did you",
  "are you",
  "have you",
  "will you",
  "would you",
  "can you",
  "could you",
  "how many",
  "how much",
  "how long",
  "how would you",
  "what is your",
  "what are your",
  "what's your",
  "why do you",
  "why are you",
  "when could you",
  "when can you",
  "where are you",
  "which of",
  "tell us",
  "describe",
  "please describe",
  "please tell",
  "please share",
];

/** Longest line still plausibly one question; past this it is a paragraph that happens to end in "?". */
const MAX_LINE_CHARS = MAX_SCREENING_QUESTION_CHARS;

/** Shortest; below this it is "Why?" or a stray fragment. */
const MIN_LINE_CHARS = 12;

/** Strips a leading bullet, dash, or "3." / "3)" numbering. */
function strip(line: string): string {
  return line
    .replace(/^[\s•‣◦⁃∙*+\-–—]+/, "")
    .replace(/^\(?\d{1,2}[.)]\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Questions the post appears to be asking the applicant, in the order it asks them, deduplicated
 * case-insensitively and capped at `MAX_SCREENING_QUESTIONS` — the same cap `buildKitInput`
 * applies, so the list handed to the model is the list the page shows.
 *
 * Returns an empty array freely. `buildKitInput` states the empty case to the model explicitly
 * rather than omitting the section, so no questions is a fact rather than a gap.
 */
export function findScreeningQuestions(rawText: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();

  for (const raw of rawText.split(/\r?\n/)) {
    const line = strip(raw);
    if (line.length < MIN_LINE_CHARS || line.length > MAX_LINE_CHARS) continue;
    if (!line.endsWith("?")) continue;

    const lower = line.toLowerCase();
    if (!STEMS.some((stem) => lower.startsWith(stem))) continue;
    if (seen.has(lower)) continue;

    seen.add(lower);
    found.push(line);
    if (found.length >= MAX_SCREENING_QUESTIONS) break;
  }

  return found;
}
