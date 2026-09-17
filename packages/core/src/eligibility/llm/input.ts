// The user message of the `job-enrichment` task: the public post as labeled plain text. Quotes are
// verified against this same text, and each section records which evidence field it came from.
// Isomorphic.

import type { EvidenceField } from "../signals";

export interface EnrichmentPost {
  title: string;
  company?: string | null;
  /** `jobs.locations`. */
  locations: readonly string[];
  /** `jobs.workplace_type`. */
  workplaceType: string | null;
  /** Raw vendor employment type (`jobs.employment_type`). */
  employmentType: string | null;
  /** Plain-text description (`jobs.raw_text`). */
  descriptionText: string;
}

/**
 * Coordinate spaces. `start`/`end` are offsets in the model input `text`. `sourceStart` is the
 * offset, in the field's own raw text, of the character at `start`, so an input offset `i` inside
 * the section maps to field offset `i - start + sourceStart`. The field texts are the ones the rules
 * extractor sees: `title` and `descriptionText` as given (rules offsets index into them), and
 * `locations.join("; ")` for the locations field. The text is only trimmed, never rewritten.
 */
export interface EnrichmentInputSection {
  field: EvidenceField;
  /** UTF-16 offsets of the section's value inside `text`. */
  start: number;
  end: number;
  /** Offset in the field's raw text of the character at `start`. */
  sourceStart: number;
}

export interface EnrichmentInput {
  text: string;
  sections: EnrichmentInputSection[];
  /** True when the description was cut to MAX_DESCRIPTION_CHARS. */
  truncated: boolean;
}

/** About 5k tokens of description; longer posts are cut (benefits and EEO text sit at the end). */
export const MAX_DESCRIPTION_CHARS = 20_000;

export function buildEnrichmentInput(post: EnrichmentPost): EnrichmentInput {
  let text = "";
  const sections: EnrichmentInputSection[] = [];
  const leading = (raw: string) => raw.length - raw.trimStart().length;
  const line = (label: string, value: string, field: EvidenceField | null, sourceStart = 0) => {
    text += `${label}: `;
    const start = text.length;
    text += value;
    if (field) sections.push({ field, start, end: text.length, sourceStart });
    text += "\n";
  };

  line("Title", post.title.trim(), "title", leading(post.title));
  if (post.company?.trim()) line("Company", post.company.trim(), null);
  line(
    "Locations",
    post.locations.length > 0 ? post.locations.join("; ") : "(none listed)",
    "locations",
  );
  line("Workplace type", post.workplaceType?.trim() || "(not given)", null);
  line(
    "Employment type",
    post.employmentType?.trim() || "(not given)",
    "employment-type",
    leading(post.employmentType ?? ""),
  );

  const description = post.descriptionText.trim();
  const truncated = description.length > MAX_DESCRIPTION_CHARS;
  text += "\nDescription:\n";
  const start = text.length;
  text += truncated ? description.slice(0, MAX_DESCRIPTION_CHARS) : description;
  sections.push({
    field: "description",
    start,
    end: text.length,
    sourceStart: leading(post.descriptionText),
  });
  if (truncated) text += "\n(description truncated)";
  return { text, sections, truncated };
}
