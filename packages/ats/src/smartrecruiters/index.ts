// SmartRecruiters connector. The Posting API list has no description, salary or URLs, so
// `listJobs` returns jobs with `detailComplete: false` and `fetchJobDetail` reads one posting.
//
// Policy note: api.smartrecruiters.com/robots.txt disallows every agent except LinkedInBot, while
// the developer docs call the Posting API public by design. Whether this connector runs in
// production is the owner's decision (research 15).
import type { z } from "zod";
import { AtsError } from "../shared/errors";
import { htmlToText, parseDate, workplaceTypeFromText } from "../shared/text";
import type {
  AtsConnector,
  BoardRef,
  ConnectorContext,
  NormalizedJob,
  NormalizedSalary,
  SalaryPeriod,
  WorkplaceType,
} from "../shared/types";
import {
  smartrecruitersListSchema,
  smartrecruitersPostingSchema,
  type SmartRecruitersListPosting,
  type SmartRecruitersPosting,
} from "./schema";

const API = "https://api.smartrecruiters.com/v1/companies";
const PAGE_SIZE = 100; // Documented maximum.
const TIMEOUT_MS = 60_000;

export const smartrecruitersConnector: AtsConnector = {
  kind: "smartrecruiters",
  // Documented: 10 requests/s and 8 concurrent per credential; stay well below both.
  rateLimits: { "api.smartrecruiters.com": { maxConcurrent: 4, minIntervalMs: 150 } },

  async listJobs(ref: BoardRef, ctx: ConnectorContext): Promise<NormalizedJob[]> {
    const company = encodeURIComponent(ref.boardToken);
    const jobs: NormalizedJob[] = [];
    // An unknown company answers 200 with an empty list, exactly like a company with no
    // openings, so a dead board cannot be detected here: both return [].
    for (let offset = 0; ;) {
      const url = `${API}/${company}/postings?limit=${PAGE_SIZE}&offset=${offset}`;
      const body = await ctx.http.getJson(url, {
        ref,
        boardRoot: offset === 0,
        signal: ctx.signal,
        timeoutMs: TIMEOUT_MS,
      });
      const page = validate(ref, url, smartrecruitersListSchema, body);
      for (const posting of page.content) jobs.push(mapListPosting(ref, posting));
      offset += page.content.length;
      if (page.content.length === 0 || offset >= page.totalFound) break;
    }
    return dedupeById(jobs);
  },

  async fetchJobDetail(
    ref: BoardRef,
    job: NormalizedJob,
    ctx: ConnectorContext,
  ): Promise<NormalizedJob> {
    const url = `${API}/${encodeURIComponent(ref.boardToken)}/postings/${encodeURIComponent(job.externalId)}`;
    // A removed posting answers 404 RESOURCE_NOT_FOUND, surfaced as AtsError `http` 404.
    const body = await ctx.http.getJson(url, { ref, signal: ctx.signal, timeoutMs: TIMEOUT_MS });
    const posting = validate(ref, url, smartrecruitersPostingSchema, body);
    return mapDetailPosting(ref, posting, job);
  },
};

function validate<T>(ref: BoardRef, url: string, schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (parsed.success) return parsed.data;
  throw new AtsError({
    kind: "parse",
    ats: ref.ats,
    boardToken: ref.boardToken,
    url,
    message: `unexpected SmartRecruiters shape: ${parsed.error.issues[0]?.message ?? "invalid"}`,
    cause: parsed.error,
  });
}

function mapListPosting(ref: BoardRef, posting: SmartRecruitersListPosting): NormalizedJob {
  const externalId = String(posting.id);
  const title = posting.name.trim();
  const locations = postingLocations(posting);
  return {
    ats: ref.ats,
    boardToken: ref.boardToken,
    externalId,
    title,
    descriptionHtml: null,
    descriptionText: "",
    locations,
    workplaceType: workplaceType(posting, title, locations),
    department: nonEmpty(posting.department?.label),
    employmentType: nonEmpty(posting.typeOfEmployment?.label),
    salary: null,
    // The list has no posting URL. This slug-less form of the public page answers 200;
    // fetchJobDetail replaces it with the vendor's `postingUrl`.
    url: `https://jobs.smartrecruiters.com/${encodeURIComponent(ref.boardToken)}/${encodeURIComponent(externalId)}`,
    applyUrl: null,
    postedAt: parseDate(posting.releasedDate),
    updatedAt: null, // Only releasedDate exists; it moves when the employer re-posts.
    detailComplete: false,
  };
}

function mapDetailPosting(
  ref: BoardRef,
  posting: SmartRecruitersPosting,
  listed: NormalizedJob,
): NormalizedJob {
  const base = mapListPosting(ref, posting);
  const descriptionHtml = descriptionFromSections(posting);
  return {
    ...base,
    // Keep list values where the detail left a field empty.
    locations: base.locations.length > 0 ? base.locations : listed.locations,
    department: base.department ?? listed.department,
    employmentType: base.employmentType ?? listed.employmentType,
    postedAt: base.postedAt ?? listed.postedAt,
    descriptionHtml,
    descriptionText: htmlToText(descriptionHtml),
    salary: salary(posting),
    url: nonEmpty(posting.postingUrl) ?? base.url,
    applyUrl: nonEmpty(posting.applyUrl),
    detailComplete: true,
  };
}

const SECTION_ORDER = [
  "companyDescription",
  "jobDescription",
  "qualifications",
  "additionalInformation",
] as const;

/** jobAd sections in page order, each under its own (vendor-localised) title. */
function descriptionFromSections(posting: SmartRecruitersPosting): string | null {
  const sections = posting.jobAd?.sections;
  if (!sections) return null;
  const html: string[] = [];
  for (const key of SECTION_ORDER) {
    const section = sections[key];
    const text = nonEmpty(section?.text);
    if (!text) continue;
    const title = nonEmpty(section?.title);
    if (title) html.push(`<h3>${escapeHtml(title)}</h3>`);
    html.push(text);
  }
  return html.length > 0 ? html.join("\n") : null;
}

function postingLocations(posting: SmartRecruitersListPosting): string[] {
  const loc = posting.location;
  if (!loc) return [];
  const full =
    nonEmpty(loc.fullLocation) ??
    [loc.city, loc.region, loc.country]
      .map((p) => p?.trim() ?? "")
      .filter((p) => p.length > 0)
      .join(", ");
  return full ? [full] : [];
}

function workplaceType(
  posting: SmartRecruitersListPosting,
  title: string,
  locations: string[],
): WorkplaceType {
  const loc = posting.location;
  if (loc?.hybrid === true) return "hybrid";
  if (loc?.remote === true) return "remote";
  // Both flags explicitly false: the posting is structured as on-site.
  if (loc?.remote === false && loc.hybrid === false) return "onsite";
  return workplaceTypeFromText(title, ...locations);
}

const PERIODS: Readonly<Record<string, SalaryPeriod>> = {
  HOURLY: "hour",
  DAILY: "day",
  MONTHLY: "month",
  YEARLY: "year",
};

function salary(posting: SmartRecruitersPosting): NormalizedSalary | null {
  const c = posting.compensation;
  if (!c) return null;
  const min = toNumber(c.min);
  const max = toNumber(c.max);
  if (min === null && max === null) return null;
  const rawPeriod = nonEmpty(c.period)?.toUpperCase() ?? null;
  const period = rawPeriod ? (PERIODS[rawPeriod] ?? null) : null;
  return {
    min,
    max,
    currency: nonEmpty(c.currency)?.toUpperCase() ?? null,
    period,
    // WEEKLY has no SalaryPeriod; keep the vendor's period so it is not lost.
    text: rawPeriod && !period ? rawPeriod : null,
  };
}

function dedupeById(jobs: NormalizedJob[]): NormalizedJob[] {
  // Offset paging can repeat a posting when the list shifts between pages.
  const seen = new Map<string, NormalizedJob>();
  for (const job of jobs) if (!seen.has(job.externalId)) seen.set(job.externalId, job);
  return [...seen.values()];
}

function toNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value.trim());
  return Number.isFinite(n) ? n : null;
}

function nonEmpty(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
