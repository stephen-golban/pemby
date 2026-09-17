import {
  DB_SENIORITIES,
  DB_WAYS_OF_WORKING,
  SENIORITIES,
  defaultWaysFor,
  fromDbSeniority,
  fromDbWay,
  isCountryCode,
  type DbSeniority,
  type DbWayOfWorking,
  type Seniority,
} from "@pemby/core";
import type { TeaserInput } from "./index";

/** The `profiles` columns the teaser reads, as raw SQL returns them (enum arrays cast to text[]). */
export interface TeaserProfileRow {
  residence_country: string | null;
  ways_of_working: string[];
  seniority: string | null;
  titles: string[];
  stack: string[];
}

const isDbWay = (v: unknown): v is DbWayOfWorking =>
  typeof v === "string" && (DB_WAYS_OF_WORKING as readonly string[]).includes(v);
const isDbSeniority = (v: unknown): v is DbSeniority =>
  typeof v === "string" && (DB_SENIORITIES as readonly string[]).includes(v);
const isSeniority = (v: unknown): v is Seniority =>
  typeof v === "string" && (SENIORITIES as readonly string[]).includes(v);

function strings(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((s): s is string => typeof s === "string" && s.trim() !== "")
    .map((s) => s.trim());
}

function countryOf(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const code = v.trim().toUpperCase();
  return isCountryCode(code) ? code : null;
}

/**
 * Teaser input from a `profiles` row, field by field falling back to the latest parsed CV
 * (`cv_files.parsed`, read defensively because demo and older rows may not match `ParsedProfile`).
 * Empty ways fall back to `defaultWaysFor(seniority)`.
 */
export function teaserInputFromProfile(
  profileRow: TeaserProfileRow | null,
  latestParsed: unknown,
): TeaserInput {
  const parsed =
    latestParsed && typeof latestParsed === "object"
      ? (latestParsed as Record<string, unknown>)
      : {};
  const parsedLocation =
    parsed.location && typeof parsed.location === "object"
      ? (parsed.location as Record<string, unknown>)
      : {};

  const country = countryOf(profileRow?.residence_country) ?? countryOf(parsedLocation.country);

  const seniority: Seniority | null = isDbSeniority(profileRow?.seniority)
    ? fromDbSeniority(profileRow.seniority)
    : isSeniority(parsed.seniority)
      ? parsed.seniority
      : null;

  const profileWays = (profileRow?.ways_of_working ?? []).filter(isDbWay).map(fromDbWay);
  const ways = profileWays.length > 0 ? [...new Set(profileWays)] : defaultWaysFor(seniority);

  const profileTitles = strings(profileRow?.titles);
  const profileStack = strings(profileRow?.stack);

  return {
    country,
    ways,
    seniority,
    titles: profileTitles.length > 0 ? profileTitles : strings(parsed.titles),
    stack: profileStack.length > 0 ? profileStack : strings(parsed.stack),
  };
}
