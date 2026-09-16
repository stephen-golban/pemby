// Workable connector. Reads the public widget endpoint, which returns every published job with its
// description in one call (`details=true`). The documented www.workable.com/api/accounts/{sub}
// host 302-redirects here, so this calls apply.workable.com directly.
import { AtsError } from "../shared/errors";
import { htmlToText, parseDate, workplaceTypeFromText } from "../shared/text";
import type {
  AtsConnector,
  BoardRef,
  ConnectorContext,
  NormalizedJob,
  WorkplaceType,
} from "../shared/types";
import { workableAccountSchema, type WorkableJob, type WorkableLocation } from "./schema";

const HOST = "apply.workable.com";
const TIMEOUT_MS = 60_000;

export const workableConnector: AtsConnector = {
  kind: "workable",
  rateLimits: { [HOST]: { maxConcurrent: 2, minIntervalMs: 500 } },

  async listJobs(ref: BoardRef, ctx: ConnectorContext): Promise<NormalizedJob[]> {
    const url = `https://${HOST}/api/v1/widget/accounts/${encodeURIComponent(ref.boardToken)}?details=true`;
    // Unknown account: 404 "Not Found", which boardRoot turns into board-not-found.
    const body = await ctx.http.getJson(url, {
      ref,
      boardRoot: true,
      signal: ctx.signal,
      timeoutMs: TIMEOUT_MS,
    });
    const parsed = workableAccountSchema.safeParse(body);
    if (!parsed.success) {
      throw new AtsError({
        kind: "parse",
        ats: ref.ats,
        boardToken: ref.boardToken,
        url,
        message: `unexpected Workable account shape: ${parsed.error.issues[0]?.message ?? "invalid"}`,
        cause: parsed.error,
      });
    }
    return parsed.data.jobs.map((job) => mapJob(ref, job));
  },
};

function mapJob(ref: BoardRef, job: WorkableJob): NormalizedJob {
  const descriptionHtml = nonEmpty(job.description);
  const locations = jobLocations(job);
  // Live data (2026-09-16): `url`/`shortlink` are the posting page `/j/{shortcode}` and
  // `application_url` is `/j/{shortcode}/apply`. The docs describe the two the other way round.
  const url = nonEmpty(job.url) ?? nonEmpty(job.shortlink) ?? `https://${HOST}/j/${job.shortcode}`;
  return {
    ats: ref.ats,
    boardToken: ref.boardToken,
    externalId: job.shortcode,
    title: job.title.trim(),
    descriptionHtml,
    descriptionText: htmlToText(descriptionHtml),
    locations,
    workplaceType: workplaceType(job, locations),
    department: nonEmpty(job.department),
    employmentType: nonEmpty(job.employment_type),
    salary: null, // The public endpoint has no salary fields.
    url,
    applyUrl: nonEmpty(job.application_url),
    postedAt: parseDate(job.published_on) ?? parseDate(job.created_at),
    updatedAt: null, // No updated time; published_on/created_at are creation dates.
    detailComplete: true,
  };
}

/**
 * `locations[]` when present, else the top-level city/state/country. A location marked `hidden`
 * keeps only its country: the employer chose not to show the city.
 */
function jobLocations(job: WorkableJob): string[] {
  const out: string[] = [];
  const entries = job.locations ?? [];
  for (const loc of entries) out.push(formatLocation(loc));
  if (entries.length === 0) {
    out.push(joinParts([job.city, job.state, job.country]));
  }
  return dedupe(out);
}

function formatLocation(loc: WorkableLocation): string {
  if (loc.hidden) return joinParts([loc.country]);
  return joinParts([loc.city, loc.region, loc.country]);
}

function workplaceType(job: WorkableJob, locations: string[]): WorkplaceType {
  switch (job.workplace_type?.toLowerCase()) {
    case "remote":
      return "remote";
    case "hybrid":
      return "hybrid";
    case "on_site":
    case "onsite":
      return "onsite";
  }
  if (job.telecommuting === true) return "remote";
  return workplaceTypeFromText(job.title, ...locations);
}

function nonEmpty(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function joinParts(parts: Array<string | null | undefined>): string {
  return dedupe(parts.map((p) => p?.trim() ?? "")).join(", ");
}

function dedupe(values: string[]): string[] {
  return [...new Set(values.filter((v) => v.length > 0))];
}
