// Greenhouse job -> NormalizedJob.
import { decodeHtmlEntities, htmlToText, parseDate, workplaceTypeFromText } from "../shared/text";
import type { BoardRef, NormalizedJob, NormalizedSalary, SalaryPeriod } from "../shared/types";
import type { GreenhouseJob, GreenhousePayRange } from "./schema";

export function mapGreenhouseJob(ref: BoardRef, job: GreenhouseJob): NormalizedJob {
  // `content` arrives entity-escaped ("&lt;p&gt;"); decode once to get real HTML.
  const descriptionHtml = job.content ? decodeHtmlEntities(job.content) : null;
  const locations = greenhouseLocations(job);
  const employmentType = metadataText(job, /^employment (type|length)$/i);

  return {
    ats: "greenhouse",
    boardToken: ref.boardToken,
    externalId: String(job.id),
    title: job.title.trim(),
    descriptionHtml,
    descriptionText: htmlToText(descriptionHtml),
    locations,
    // No structured workplace field on Greenhouse.
    workplaceType: workplaceTypeFromText(...locations, job.title),
    department: firstName(job.departments),
    employmentType,
    salary: greenhouseSalary(job.pay_input_ranges),
    url: job.absolute_url,
    // The posting page carries the application form; there is no separate apply URL.
    applyUrl: null,
    postedAt: parseDate(job.first_published),
    updatedAt: parseDate(job.updated_at),
    detailComplete: true,
  };
}

/**
 * `location.name` is free text that joins several places with " • " on multi-location posts, so it
 * is split on the bullet (never on commas, which separate city and country). Office names follow.
 */
function greenhouseLocations(job: GreenhouseJob): string[] {
  const primary = (job.location?.name ?? "").split("•");
  const offices = (job.offices ?? []).map((office) => office.name);
  return dedupe([...primary, ...offices]);
}

function firstName(items: Array<{ name?: string | null }> | null | undefined): string | null {
  for (const item of items ?? []) {
    const name = item.name?.trim();
    if (name) return name;
  }
  return null;
}

function metadataText(job: GreenhouseJob, name: RegExp): string | null {
  for (const entry of job.metadata ?? []) {
    if (!entry.name || !name.test(entry.name.trim())) continue;
    const value = Array.isArray(entry.value) ? entry.value[0] : entry.value;
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

/**
 * `pay_input_ranges` (present with `pay_transparency=true`). A post can list several ranges (per
 * zone or level): min/max span every range that shares the first range's currency and title. The
 * period comes from the range title ("Annual Base Salary Range:"), since there is no field for it.
 */
function greenhouseSalary(
  ranges: GreenhousePayRange[] | null | undefined,
): NormalizedSalary | null {
  const usable = (ranges ?? []).filter(
    (range) => typeof range.min_cents === "number" || typeof range.max_cents === "number",
  );
  const first = usable[0];
  if (!first) return null;

  const currency = first.currency_type?.trim() || null;
  const title = first.title?.trim() || null;
  const group = usable.filter(
    (range) =>
      (range.currency_type?.trim() || null) === currency && (range.title?.trim() || null) === title,
  );
  const mins = group.flatMap((range) =>
    typeof range.min_cents === "number" ? [range.min_cents] : [],
  );
  const maxes = group.flatMap((range) =>
    typeof range.max_cents === "number" ? [range.max_cents] : [],
  );

  return {
    min: mins.length ? Math.min(...mins) / 100 : null,
    max: maxes.length ? Math.max(...maxes) / 100 : null,
    currency,
    period: periodFromTitle(title),
    text: usable.map(describeRange).join("; ") || null,
  };
}

function periodFromTitle(title: string | null): SalaryPeriod | null {
  if (!title) return null;
  const t = title.toLowerCase();
  if (/\b(hourly|per hour|an hour)\b/.test(t)) return "hour";
  if (/\b(daily|per day|day rate)\b/.test(t)) return "day";
  if (/\b(monthly|per month)\b/.test(t)) return "month";
  if (/\b(annual|annually|yearly|per year|per annum)\b/.test(t)) return "year";
  return null;
}

const numberFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

function describeRange(range: GreenhousePayRange): string {
  const amount = (cents: number | null | undefined) =>
    typeof cents === "number" ? numberFormat.format(cents / 100) : "?";
  const label = range.title?.trim().replace(/:$/, "");
  const figures =
    `${amount(range.min_cents)}–${amount(range.max_cents)} ${range.currency_type ?? ""}`.trim();
  return label ? `${label}: ${figures}` : figures;
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
