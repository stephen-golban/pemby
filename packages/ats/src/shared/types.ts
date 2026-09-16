// The shape every connector returns and the interface every connector implements.
import type { AtsKind, AtsRegion, SourceEntry } from "@pemby/core/private-config";
import type { HostRateLimit, HttpClient } from "./http";

export type WorkplaceType = "remote" | "hybrid" | "onsite" | "unknown";

export type SalaryPeriod = "hour" | "day" | "month" | "year";

export interface NormalizedSalary {
  min: number | null;
  max: number | null;
  /** ISO 4217 code when the vendor gives one, otherwise the raw value. */
  currency: string | null;
  period: SalaryPeriod | null;
  /** The vendor's own salary text, when it has one. */
  text: string | null;
}

/** One board on one vendor. `region` picks the vendor's API host. */
export interface BoardRef {
  ats: AtsKind;
  boardToken: string;
  region: AtsRegion;
}

export interface NormalizedJob {
  ats: AtsKind;
  boardToken: string;
  /** Vendor job id, as a string. Unique within (ats, boardToken). */
  externalId: string;
  title: string;
  /** Description HTML, decoded (real tags, not entity-escaped). Null when unknown. */
  descriptionHtml: string | null;
  /** Readable plain text of the description; "" when unknown. */
  descriptionText: string;
  /** Every location string the vendor lists, primary first, raw (includes "Remote" labels). */
  locations: string[];
  workplaceType: WorkplaceType;
  department: string | null;
  /** Raw vendor value, for example "Full-time" or "FULL_TIME". */
  employmentType: string | null;
  salary: NormalizedSalary | null;
  /** Public posting page. */
  url: string;
  applyUrl: string | null;
  postedAt: Date | null;
  updatedAt: Date | null;
  /** False when the list endpoint lacks the description and `fetchJobDetail` must run. */
  detailComplete: boolean;
}

export interface ConnectorContext {
  http: HttpClient;
  signal: AbortSignal;
}

export interface AtsConnector {
  readonly kind: AtsKind;
  /**
   * Per-host request limits this connector needs, keyed by exact host
   * ("boards-api.greenhouse.io") or by a suffix starting with "." (".jobs.personio.de", which
   * shares one limiter across all its subdomains). Hosts not listed get the client default.
   */
  readonly rateLimits: Readonly<Record<string, HostRateLimit>>;
  /**
   * Every open job on one board, all pages, with as few requests as the vendor allows.
   * Throws AtsError; `board-not-found` means the board itself is gone.
   */
  listJobs(ref: BoardRef, ctx: ConnectorContext): Promise<NormalizedJob[]>;
  /**
   * Fills in what the list lacked (description and anything else) and returns the job with
   * `detailComplete: true`. Present only on vendors whose list omits descriptions.
   */
  fetchJobDetail?(ref: BoardRef, job: NormalizedJob, ctx: ConnectorContext): Promise<NormalizedJob>;
}

/** Board reference for a source-list entry (absent region means "us"). */
export function boardRefFromSource(
  entry: Pick<SourceEntry, "ats" | "boardToken" | "region">,
): BoardRef {
  return { ats: entry.ats, boardToken: entry.boardToken, region: entry.region ?? "us" };
}
