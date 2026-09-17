import {
  SENIORITIES,
  WAYS_OF_WORKING,
  isCountryCode,
  type Seniority,
  type WayOfWorking,
} from "@pemby/core";

// Query-string overrides for GET /api/teaser. Hand-validated: `zod` is not a dependency of
// @pemby/web (it resolves only inside packages that declare it).

export const TEASER_TITLES_MAX = 5;
const TITLE_CHARS_MAX = 100;

export interface TeaserOverrides {
  country?: string;
  ways?: WayOfWorking[];
  seniority?: Seniority;
  titles?: string[];
}

export type ParsedTeaserQuery = { ok: true; overrides: TeaserOverrides } | { ok: false };

const list = (raw: string) => raw.split(",").map((s) => s.trim());

/** Every present param must be valid; an empty value or unknown enum value rejects the query. */
export function parseTeaserQuery(params: URLSearchParams): ParsedTeaserQuery {
  const overrides: TeaserOverrides = {};
  for (const name of ["country", "ways", "seniority", "titles"]) {
    if (params.getAll(name).length > 1) return { ok: false };
  }

  const country = params.get("country");
  if (country !== null) {
    const code = country.trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(code) || !isCountryCode(code)) return { ok: false };
    overrides.country = code;
  }

  const ways = params.get("ways");
  if (ways !== null) {
    const values = list(ways);
    if (
      !values.every((v): v is WayOfWorking => (WAYS_OF_WORKING as readonly string[]).includes(v))
    ) {
      return { ok: false };
    }
    overrides.ways = [...new Set(values)];
  }

  const seniority = params.get("seniority");
  if (seniority !== null) {
    if (!(SENIORITIES as readonly string[]).includes(seniority)) return { ok: false };
    overrides.seniority = seniority as Seniority;
  }

  const titles = params.get("titles");
  if (titles !== null) {
    const values = list(titles);
    if (
      values.length > TEASER_TITLES_MAX ||
      values.some((t) => t.length === 0 || t.length > TITLE_CHARS_MAX)
    ) {
      return { ok: false };
    }
    overrides.titles = values;
  }

  return { ok: true, overrides };
}
