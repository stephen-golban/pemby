// Lever posting -> NormalizedJob.
import { htmlToText, parseDate, workplaceTypeFromText } from "../shared/text";
import type {
  BoardRef,
  NormalizedJob,
  NormalizedSalary,
  SalaryPeriod,
  WorkplaceType,
} from "../shared/types";
import type { LeverPosting, LeverSalaryRange } from "./schema";

export function mapLeverPosting(ref: BoardRef, posting: LeverPosting): NormalizedJob {
  const categories = posting.categories;
  const locations = dedupe([categories?.location, ...(categories?.allLocations ?? [])]);
  const descriptionHtml = leverDescriptionHtml(posting);

  return {
    ats: "lever",
    boardToken: ref.boardToken,
    externalId: posting.id,
    title: posting.text.trim(),
    descriptionHtml,
    descriptionText: htmlToText(descriptionHtml),
    locations,
    workplaceType: leverWorkplaceType(posting.workplaceType, locations, posting.text),
    department: categories?.department?.trim() || categories?.team?.trim() || null,
    employmentType: categories?.commitment?.trim() || null,
    salary: leverSalary(posting.salaryRange),
    url: posting.hostedUrl,
    applyUrl: posting.applyUrl ?? null,
    postedAt: parseDate(posting.createdAt),
    // Lever exposes no updated time.
    updatedAt: null,
    detailComplete: true,
  };
}

/**
 * The hosted posting page, rebuilt: `description` (opening and body), then each `lists` section
 * (requirements, responsibilities) as a heading plus list, then salary text and `additional`.
 * `description` alone would drop the requirements.
 */
function leverDescriptionHtml(posting: LeverPosting): string | null {
  const parts: string[] = [];
  if (posting.description?.trim()) parts.push(posting.description);
  for (const list of posting.lists ?? []) {
    const heading = list.text?.trim();
    const content = list.content?.trim();
    if (heading) parts.push(`<h3>${escapeHtml(heading)}</h3>`);
    if (content)
      parts.push(/^<li[\s>]/i.test(content) ? `<ul>${content}</ul>` : `<div>${content}</div>`);
  }
  if (posting.salaryDescription?.trim()) parts.push(posting.salaryDescription);
  if (posting.additional?.trim()) parts.push(posting.additional);
  return parts.length ? parts.join("\n") : null;
}

function leverWorkplaceType(
  value: string | null | undefined,
  locations: string[],
  title: string,
): WorkplaceType {
  switch (value?.toLowerCase()) {
    // Live data says "onsite"; Lever's README says "on-site". Accept both.
    case "onsite":
    case "on-site":
      return "onsite";
    case "remote":
      return "remote";
    case "hybrid":
      return "hybrid";
    default:
      return workplaceTypeFromText(...locations, title);
  }
}

/** `salaryRange.interval` is "per-year-salary", "per-hour-wage", "per-month-salary", "one-time", ... */
function leverSalary(range: LeverSalaryRange | null | undefined): NormalizedSalary | null {
  if (!range) return null;
  const min = typeof range.min === "number" ? range.min : null;
  const max = typeof range.max === "number" ? range.max : null;
  if (min === null && max === null) return null;
  return {
    min,
    max,
    currency: range.currency?.trim() || null,
    period: periodFromInterval(range.interval),
    // Lever has no short salary summary; its salaryDescription prose is kept in the description.
    text: null,
  };
}

function periodFromInterval(interval: string | null | undefined): SalaryPeriod | null {
  const match = /^per-(hour|day|month|year)\b/.exec(interval?.toLowerCase() ?? "");
  return (match?.[1] as SalaryPeriod | undefined) ?? null;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function dedupe(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const trimmed = value?.replace(/\s+/g, " ").trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}
