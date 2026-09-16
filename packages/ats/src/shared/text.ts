// Text, date and hashing helpers shared by every connector.
import { createHash } from "node:crypto";
import { decodeHTML } from "entities";
import { convert } from "html-to-text";
import type { NormalizedJob, WorkplaceType } from "./types";

const HEADING = { options: { uppercase: false } } as const;

/**
 * Readable plain text from description HTML: entities decoded, paragraphs and list items on
 * their own lines, no link targets or images, no hard wrapping. "" for null/empty input.
 * Pass real HTML; if the vendor entity-escapes its HTML, run `decodeHtmlEntities` first.
 */
export function htmlToText(html: string | null | undefined): string {
  if (!html) return "";
  const text = convert(html, {
    wordwrap: false,
    selectors: [
      { selector: "a", options: { ignoreHref: true } },
      { selector: "img", format: "skip" },
      { selector: "h1", ...HEADING },
      { selector: "h2", ...HEADING },
      { selector: "h3", ...HEADING },
      { selector: "h4", ...HEADING },
      { selector: "h5", ...HEADING },
      { selector: "h6", ...HEADING },
      { selector: "table", format: "dataTable" },
    ],
  });
  return text
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Decodes HTML entities once ("&lt;p&gt;" becomes "<p>"). For APIs that escape their HTML. */
export function decodeHtmlEntities(value: string): string {
  return decodeHTML(value);
}

/**
 * Date from an ISO/RFC string, epoch milliseconds (number or digit string), or a Date.
 * Numbers below 1e11 are read as epoch seconds. Null for anything unreadable.
 */
export function parseDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") return null;
  let date: Date;
  if (value instanceof Date) {
    date = new Date(value.getTime());
  } else if (
    typeof value === "number" ||
    (typeof value === "string" && /^\d+$/.test(value.trim()))
  ) {
    const n = Number(value);
    date = new Date(n < 1e11 ? n * 1000 : n);
  } else if (typeof value === "string") {
    date = new Date(value.trim());
  } else {
    return null;
  }
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Keyword fallback when a vendor has no structured workplace field: "hybrid" wins over
 * "remote"; anything else is "unknown" (never guesses "onsite").
 */
export function workplaceTypeFromText(
  ...candidates: Array<string | null | undefined>
): WorkplaceType {
  const text = candidates.filter(Boolean).join(" ").toLowerCase();
  if (/\bhybrid\b/.test(text)) return "hybrid";
  if (/\b(remote|anywhere|work from home|wfh)\b/.test(text)) return "remote";
  return "unknown";
}

export type ContentHashInput = Pick<
  NormalizedJob,
  | "title"
  | "descriptionText"
  | "locations"
  | "workplaceType"
  | "department"
  | "employmentType"
  | "salary"
>;

/**
 * sha256 hex over the fields that should trigger re-enrichment when they change. Location order
 * and surrounding whitespace do not count; URLs, dates and HTML markup do not count.
 */
export function contentHash(job: ContentHashInput): string {
  const canonical = [
    job.title.trim(),
    job.descriptionText.trim(),
    [...new Set(job.locations.map((l) => l.trim()))].sort(),
    job.workplaceType,
    job.department?.trim() ?? null,
    job.employmentType?.trim() ?? null,
    job.salary
      ? [
          job.salary.min,
          job.salary.max,
          job.salary.currency,
          job.salary.period,
          job.salary.text?.trim() ?? null,
        ]
      : null,
  ];
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}
