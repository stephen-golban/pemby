// Ashby job -> NormalizedJob.
import { htmlToText, parseDate, workplaceTypeFromText } from "../shared/text";
import type {
  BoardRef,
  NormalizedJob,
  NormalizedSalary,
  SalaryPeriod,
  WorkplaceType,
} from "../shared/types";
import type { AshbyCompensation, AshbyJob } from "./schema";

export function mapAshbyJob(ref: BoardRef, job: AshbyJob): NormalizedJob {
  const locations = dedupe([
    job.location,
    ...(job.secondaryLocations ?? []).map((secondary) => secondary.location),
  ]);
  const descriptionHtml = job.descriptionHtml?.trim() ? job.descriptionHtml : null;

  return {
    ats: "ashby",
    boardToken: ref.boardToken,
    externalId: job.id,
    title: job.title.trim(),
    descriptionHtml,
    descriptionText: htmlToText(descriptionHtml),
    locations,
    workplaceType: ashbyWorkplaceType(job, locations),
    department: job.department?.trim() || job.team?.trim() || null,
    employmentType: job.employmentType?.trim() || null,
    salary:
      job.shouldDisplayCompensationOnJobPostings === false ? null : ashbySalary(job.compensation),
    url: job.jobUrl,
    applyUrl: job.applyUrl ?? null,
    // "when the job was last published"; Ashby exposes no updated time.
    postedAt: parseDate(job.publishedAt),
    updatedAt: null,
    detailComplete: true,
  };
}

function ashbyWorkplaceType(job: AshbyJob, locations: string[]): WorkplaceType {
  switch (job.workplaceType?.toLowerCase()) {
    case "onsite":
    case "on-site":
      return "onsite";
    case "remote":
      return "remote";
    case "hybrid":
      return "hybrid";
  }
  // `workplaceType` is often null. `isRemote` is also true on hybrid posts, so it only decides
  // when the structured type is absent.
  if (job.isRemote === true) return "remote";
  return workplaceTypeFromText(...locations, job.title);
}

/**
 * Salary components across all compensation tiers. min/max span every salary component that
 * shares the first one's currency and interval (tiers are usually zones or levels).
 */
function ashbySalary(compensation: AshbyCompensation | null | undefined): NormalizedSalary | null {
  const components = (compensation?.compensationTiers ?? [])
    .flatMap((tier) => tier.components ?? [])
    .filter(
      (component) =>
        component.compensationType?.toLowerCase() === "salary" &&
        (typeof component.minValue === "number" || typeof component.maxValue === "number"),
    );
  const first = components[0];
  if (!first) return null;

  const group = components.filter(
    (component) =>
      component.currencyCode === first.currencyCode && component.interval === first.interval,
  );
  const mins = group.flatMap((c) => (typeof c.minValue === "number" ? [c.minValue] : []));
  const maxes = group.flatMap((c) => (typeof c.maxValue === "number" ? [c.maxValue] : []));

  return {
    min: mins.length ? Math.min(...mins) : null,
    max: maxes.length ? Math.max(...maxes) : null,
    currency: first.currencyCode?.trim() || null,
    period: periodFromInterval(first.interval),
    // The salary components' own summaries ("$211.4K – $290.6K"), without the equity and bonus
    // parts that compensationTierSummary adds.
    text: salaryText(group) ?? compensation?.compensationTierSummary?.trim() ?? null,
  };
}

function salaryText(components: Array<{ summary?: string | null }>): string | null {
  const summaries = [
    ...new Set(components.map((c) => c.summary?.trim()).filter((s): s is string => !!s)),
  ];
  return summaries.length ? summaries.join("; ") : null;
}

/** "1 YEAR", "1 HOUR", ... Anything else ("2 WEEK", "NONE") has no matching period. */
function periodFromInterval(interval: string | null | undefined): SalaryPeriod | null {
  const match = /^1 (HOUR|DAY|MONTH|YEAR)$/i.exec(interval?.trim() ?? "");
  return (match?.[1]?.toLowerCase() as SalaryPeriod | undefined) ?? null;
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
