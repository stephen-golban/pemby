// Personio connector. Reads the public XML feed, which carries every open position with its
// description sections in one document. No `language` parameter: with it most descriptions are
// missing (research 15).
import { AtsError } from "../shared/errors";
import { htmlToText, parseDate, workplaceTypeFromText } from "../shared/text";
import type {
  AtsConnector,
  BoardRef,
  ConnectorContext,
  NormalizedJob,
  NormalizedSalary,
  SalaryPeriod,
} from "../shared/types";
import { parsePersonioFeed, type PersonioPosition } from "./feed";

const TIMEOUT_MS = 60_000;
/** Company subdomain: letters, digits and hyphens only, so the token cannot change the host. */
const SUBDOMAIN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i;

export const personioConnector: AtsConnector = {
  kind: "personio",
  rateLimits: { ".jobs.personio.de": { maxConcurrent: 2, minIntervalMs: 500 } },

  async listJobs(ref: BoardRef, ctx: ConnectorContext): Promise<NormalizedJob[]> {
    const notFound = (message: string, url?: string) =>
      new AtsError({
        kind: "board-not-found",
        ats: ref.ats,
        boardToken: ref.boardToken,
        message,
        ...(url !== undefined && { url }),
      });
    if (!SUBDOMAIN.test(ref.boardToken)) {
      throw notFound("board token is not a valid Personio subdomain");
    }
    const host = `${ref.boardToken.toLowerCase()}.jobs.personio.de`;
    const url = `https://${host}/xml`;
    const get = (target: string) =>
      ctx.http.request(target, {
        ref,
        boardRoot: true,
        signal: ctx.signal,
        timeoutMs: TIMEOUT_MS,
        accept: "application/xml, text/xml",
        redirect: "manual",
      });
    // Redirects are not followed blindly: an unknown company answers 307 to https://personio.com/
    // (which itself answers bots with a 429 challenge). A redirect off the company's feed host
    // means the board is gone; one on the same host is followed once.
    const httpError = (message: string, status: number, at: string) =>
      new AtsError({
        kind: "http",
        ats: ref.ats,
        boardToken: ref.boardToken,
        status,
        url: at,
        message,
      });
    let res = await get(url);
    let target = url;
    for (let hops = 0; isRedirect(res.status); hops++) {
      const location = res.headers.get("location");
      if (!location) throw httpError(`HTTP ${res.status} without Location`, res.status, target);
      const next = new URL(location, target);
      if (next.host.toLowerCase() !== host) {
        throw notFound(`feed redirected to ${next.href}`, url);
      }
      if (hops >= 1)
        throw httpError(`redirected more than once (to ${next.href})`, res.status, target);
      target = next.href;
      res = await get(target);
    }
    const feed = parsePersonioFeed(res.body);
    if (!feed.ok) {
      throw new AtsError({
        kind: "parse",
        ats: ref.ats,
        boardToken: ref.boardToken,
        url,
        message: feed.message,
        cause: feed.cause,
      });
    }
    // A live board with no openings is a 200 <workzag-jobs> with no <position>: [].
    return feed.positions.map((position) => mapPosition(ref, host, position));
  },
};

function mapPosition(ref: BoardRef, host: string, position: PersonioPosition): NormalizedJob {
  const descriptionHtml = descriptionFromSections(position);
  const locations = [...new Set([position.office, ...position.additionalOffices].filter(isString))];
  const title = position.name ?? "";
  const url = `https://${host}/job/${encodeURIComponent(position.id)}`;
  return {
    ats: ref.ats,
    boardToken: ref.boardToken,
    externalId: position.id,
    title,
    descriptionHtml,
    descriptionText: htmlToText(descriptionHtml),
    locations,
    // The feed has no workplace field; offices are names like "Remote" at best.
    workplaceType: workplaceTypeFromText(title, ...locations),
    department: position.department,
    // "permanent" plus "full-time": the feed splits contract type and schedule.
    employmentType:
      [position.employmentType, position.schedule].filter(isString).join(", ") || null,
    salary: salary(position),
    url,
    // The posting page carries the application form; the feed has no separate apply URL.
    applyUrl: null,
    postedAt: parseDate(position.createdAt),
    updatedAt: null, // Only createdAt exists.
    detailComplete: true,
  };
}

/** Each jobDescription section as its name (a heading) followed by its HTML value. */
function descriptionFromSections(position: PersonioPosition): string | null {
  const html: string[] = [];
  for (const section of position.jobDescriptions) {
    if (!section.value) continue;
    if (section.name) html.push(`<h3>${escapeHtml(section.name)}</h3>`);
    html.push(section.value);
  }
  return html.length > 0 ? html.join("\n") : null;
}

const PERIODS: Readonly<Record<string, SalaryPeriod>> = {
  hourly: "hour",
  daily: "day",
  monthly: "month",
  yearly: "year",
  annually: "year",
};

/** `salaryInformation` is undocumented (seen live 2026-09-16): read it best-effort. */
function salary(position: PersonioPosition): NormalizedSalary | null {
  const info = position.salaryInformation;
  if (!info) return null;
  const min = toNumber(info.min);
  const max = toNumber(info.max);
  if (min === null && max === null) return null;
  const type = info.type?.toLowerCase() ?? null;
  return {
    min,
    max,
    currency: info.currencyCode?.toUpperCase() ?? info.currencySymbol ?? null,
    period: type ? (PERIODS[type] ?? null) : null,
    text: null,
  };
}

function toNumber(value: string | null): number | null {
  if (value === null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function isRedirect(status: number): boolean {
  return status >= 300 && status < 400;
}

function isString(value: string | null): value is string {
  return value !== null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
