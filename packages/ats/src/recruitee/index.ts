// Recruitee connector. Reads the Careers Site API offer list, which carries descriptions, all
// locations, workplace flags and salary in one call per board.
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
import { recruiteeOffersSchema, type RecruiteeOffer } from "./schema";

const TIMEOUT_MS = 60_000;
/** Company subdomain: letters, digits and hyphens only, so the token cannot change the host. */
const SUBDOMAIN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i;

export const recruiteeConnector: AtsConnector = {
  kind: "recruitee",
  rateLimits: { ".recruitee.com": { maxConcurrent: 2, minIntervalMs: 500 } },

  async listJobs(ref: BoardRef, ctx: ConnectorContext): Promise<NormalizedJob[]> {
    if (!SUBDOMAIN.test(ref.boardToken)) {
      throw new AtsError({
        kind: "board-not-found",
        ats: ref.ats,
        boardToken: ref.boardToken,
        message: "board token is not a valid Recruitee subdomain",
      });
    }
    // Keyless today. From 10 Feb 2027 this call needs an X-Careers-Sites-Token header:
    // https://docs.recruitee.com/reference/authentication-1
    const url = `https://${ref.boardToken.toLowerCase()}.recruitee.com/api/offers/`;
    // Unknown company: 404, which boardRoot turns into board-not-found. A live board with no
    // openings answers 200 {"offers":[]}.
    const body = await ctx.http.getJson(url, {
      ref,
      boardRoot: true,
      signal: ctx.signal,
      timeoutMs: TIMEOUT_MS,
    });
    const parsed = recruiteeOffersSchema.safeParse(body);
    if (!parsed.success) {
      throw new AtsError({
        kind: "parse",
        ats: ref.ats,
        boardToken: ref.boardToken,
        url,
        message: `unexpected Recruitee offers shape: ${parsed.error.issues[0]?.message ?? "invalid"}`,
        cause: parsed.error,
      });
    }
    return parsed.data.offers.map((offer) => mapOffer(ref, offer));
  },
};

function mapOffer(ref: BoardRef, offer: RecruiteeOffer): NormalizedJob {
  // The careers page shows the description followed by the requirements; keep both.
  const parts = [offer.description, offer.requirements].map(nonEmpty).filter(isString);
  const descriptionHtml = parts.length > 0 ? parts.join("\n") : null;
  const locations = offerLocations(offer);
  const externalId = String(offer.id);
  const url =
    nonEmpty(offer.careers_url) ??
    `https://${ref.boardToken.toLowerCase()}.recruitee.com/o/${offer.slug ?? externalId}`;
  return {
    ats: ref.ats,
    boardToken: ref.boardToken,
    externalId,
    title: offer.title.trim(),
    descriptionHtml,
    descriptionText: htmlToText(descriptionHtml),
    locations,
    workplaceType: workplaceType(offer, locations),
    department: nonEmpty(offer.department),
    employmentType: nonEmpty(offer.employment_type_code),
    salary: salary(offer),
    url,
    applyUrl: nonEmpty(offer.careers_apply_url),
    postedAt: parseDate(offer.published_at) ?? parseDate(offer.created_at),
    updatedAt: parseDate(offer.updated_at),
    detailComplete: true,
  };
}

/** `location` (the primary, "City, State, Country") first, then every entry of `locations[]`. */
function offerLocations(offer: RecruiteeOffer): string[] {
  const out: Array<string | null> = [nonEmpty(offer.location)];
  for (const loc of offer.locations ?? []) {
    out.push(joinParts([loc.city, loc.state, loc.country]) || nonEmpty(loc.name));
  }
  if (!out.some(Boolean)) out.push(joinParts([offer.city, offer.country]));
  return [...new Set(out.filter(isString).filter((v) => v.length > 0))];
}

function workplaceType(offer: RecruiteeOffer, locations: string[]): WorkplaceType {
  const { remote, hybrid, on_site: onSite } = offer;
  if (hybrid === true) return "hybrid";
  // Remote and on-site both allowed: the candidate can split time, which is a hybrid setup.
  if (remote === true && onSite === true) return "hybrid";
  if (remote === true) return "remote";
  if (onSite === true) return "onsite";
  return workplaceTypeFromText(offer.title, ...locations);
}

const PERIODS: Readonly<Record<string, SalaryPeriod>> = {
  hour: "hour",
  hourly: "hour",
  day: "day",
  daily: "day",
  month: "month",
  monthly: "month",
  year: "year",
  yearly: "year",
  annual: "year",
};

/** Only when a bound is set; a period or currency alone is not a salary. */
function salary(offer: RecruiteeOffer): NormalizedSalary | null {
  const s = offer.salary;
  if (!s) return null;
  const min = toNumber(s.min);
  const max = toNumber(s.max);
  if (min === null && max === null) return null;
  const period = s.period?.trim().toLowerCase();
  return {
    min,
    max,
    currency: nonEmpty(s.currency)?.toUpperCase() ?? null,
    period: period ? (PERIODS[period] ?? null) : null,
    text: null,
  };
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

function isString(value: string | null): value is string {
  return value !== null;
}

/** Same "City, State, Country" format as the offer's own `location`, so the primary dedupes. */
function joinParts(parts: Array<string | null | undefined>): string {
  return parts
    .map((p) => p?.trim() ?? "")
    .filter((p) => p.length > 0)
    .join(", ");
}
