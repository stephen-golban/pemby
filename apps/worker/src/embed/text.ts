// The exact text that is embedded, and the hash that makes a re-run free.
//
// What goes in is the matching signal and nothing else. The vector is compared against a profile
// vector, so boilerplate (benefits, legal footers, "about us") only moves every job closer to every
// profile. For a job that means the structured enrichment fields first, then a bounded slice of the
// post; for a profile the same fields, drawn from the profile row with the parsed CV filling the
// gaps. Both are hard-capped so one enormous posting or CV cannot blow the daily budget.
//
// Privacy: this module builds strings and never logs. Callers log ids, counts and milliseconds.
import { createHash } from "node:crypto";

/**
 * Bumped whenever the recipe below changes. It is part of the hash, so a change re-embeds
 * everything instead of leaving old vectors that were built from different text.
 */
export const EMBED_TEXT_VERSION = "1";

/** Whole job text, structured lines included. ~1,500 tokens. */
export const JOB_EMBED_MAX_CHARS = 6_000;
/** The slice of the post body inside that. The structured lines are never crowded out. */
export const JOB_POST_MAX_CHARS = 4_000;
/** Whole profile text. Profiles are lists of fields, not prose, so half a job is plenty. */
export const PROFILE_EMBED_MAX_CHARS = 3_000;

/** Longest single list rendered into a line (stack, domains, titles). */
const MAX_LIST_ITEMS = 30;
/** Longest single list item. */
const MAX_ITEM_CHARS = 60;

function clean(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function list(values: readonly (string | null | undefined)[] | null | undefined): string {
  if (!values) return "";
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const item = clean(raw).slice(0, MAX_ITEM_CHARS);
    if (!item) continue;
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= MAX_LIST_ITEMS) break;
  }
  return out.join(", ");
}

function lines(pairs: readonly (readonly [string, string])[]): string[] {
  return pairs.filter(([, value]) => value !== "").map(([label, value]) => `${label}: ${value}`);
}

export interface JobEmbeddingInput {
  title: string;
  /** `job_enrichment.role_family`, else `jobs.role_family`. */
  roleFamily: string | null;
  seniority: string | null;
  yearsMin: number | null;
  stack: readonly string[];
  domains: readonly string[];
  /** `jobs.raw_text`; only its first JOB_POST_MAX_CHARS characters are used. */
  postText: string | null;
}

/**
 * Title, role family, seniority, minimum years, stack and domains as labelled lines, then the first
 * JOB_POST_MAX_CHARS of the post. Everything else a job row carries (company, URLs, salary,
 * locations, employment types, ways of working) is deliberately left out: salary and location are
 * hard gates the matcher applies as filters, and company names and URLs are noise in a vector.
 */
export function buildJobEmbeddingText(input: JobEmbeddingInput): string {
  const head = lines([
    ["Title", clean(input.title).slice(0, 200)],
    ["Role", clean(input.roleFamily)],
    ["Seniority", clean(input.seniority)],
    ["Experience", input.yearsMin === null ? "" : `${input.yearsMin}+ years`],
    ["Stack", list(input.stack)],
    ["Domains", list(input.domains)],
  ]);
  const post = clean(input.postText).slice(0, JOB_POST_MAX_CHARS);
  const parts = post === "" ? head : [...head, `Post: ${post}`];
  return parts.join("\n").slice(0, JOB_EMBED_MAX_CHARS);
}

export interface ProfileEmbeddingInput {
  /** `profiles.titles`, with the parsed CV's titles appended. */
  titles: readonly string[];
  seniority: string | null;
  yearsExperience: number | null;
  stack: readonly string[];
  /** Only the parsed CV has domains; the profile row has no such column. */
  domains: readonly string[];
}

/**
 * Titles, seniority, years of experience, stack and domains. The same five signals as a job's head,
 * in the same labelled shape, so the two vectors describe the same kind of thing. Nothing
 * identifying goes in: no name, no employer, no location, no links, no CV prose.
 */
export function buildProfileEmbeddingText(input: ProfileEmbeddingInput): string {
  return lines([
    ["Title", list(input.titles)],
    ["Seniority", clean(input.seniority)],
    [
      "Experience",
      input.yearsExperience === null ? "" : `${Math.round(input.yearsExperience)} years`,
    ],
    ["Stack", list(input.stack)],
    ["Domains", list(input.domains)],
  ])
    .join("\n")
    .slice(0, PROFILE_EMBED_MAX_CHARS);
}

/**
 * Stable hash of the exact text that was embedded, stored in `content_hash`. The recipe version is
 * part of it, so both a changed row and a changed recipe re-embed, and an unchanged one never calls
 * the model. Never contains the text itself.
 */
export function embeddingContentHash(text: string): string {
  return createHash("sha256").update(`${EMBED_TEXT_VERSION}\n${text}`).digest("hex");
}
