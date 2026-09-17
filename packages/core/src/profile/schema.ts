// Output schema of the `cv-parse` task (phase 06 contract, "ParsedProfile"). Isomorphic.
//
// Sent as a strict JSON schema (z.toJSONSchema) to OpenRouter, so it follows the same rules as the
// job-enrichment schema: every property is required, "not stated" is `null` or `[]`, never
// `optional()`, and there are no unions besides `.nullable()`. Array limits from the contract are
// stated in each `.describe()` for the model, not enforced as `maxItems`.
//
// Validation is two steps on purpose:
//   1. `ParsedProfileSchema` checks shape and types only, with no limits. Fields a model often gets
//      slightly wrong (list lengths, country code, IANA timezone, years, link URLs) are unbounded
//      arrays and plain strings/numbers here, so one bad value never rejects, and re-asks for, the
//      whole profile.
//   2. `normalizeParsedProfile()` then enforces every limit in `PARSED_PROFILE_LIMITS` (lists cut
//      to length, strings capped) and coerces values: invalid country or timezone -> null,
//      implausible years -> null, unusable links dropped, strings trimmed, lists de-duplicated.
// Consumers store and use only the normalized result.

import { z } from "zod";

import { ALPHA3_TO_ALPHA2, isCountryCode } from "../eligibility/regions";
import { SENIORITIES } from "../ways-of-working";
import { ENGLISH_LEVELS } from "./enums";

/** Bump when the shape or meaning of a field changes; stored next to parsed output. */
export const PARSED_PROFILE_VERSION = "1";

/** Enforced by `normalizeParsedProfile`, never by the schema. */
export const PARSED_PROFILE_LIMITS = {
  titles: 5,
  stack: 30,
  domains: 10,
  roles: 10,
  education: 5,
  /** Not in the contract. */
  languages: 10,
  links: 10,
  /** Longest kept string value, applied by `normalizeParsedProfile`. */
  stringChars: 200,
} as const;

export const PROFILE_LINK_KINDS = ["github", "linkedin", "portfolio", "other"] as const;
export type ProfileLinkKind = (typeof PROFILE_LINK_KINDS)[number];

export const PROFILE_ROLE_KINDS = [
  "job",
  "internship",
  "program",
  "open-source",
  "freelance",
] as const;
export type ProfileRoleKind = (typeof PROFILE_ROLE_KINDS)[number];

const L = PARSED_PROFILE_LIMITS;
const year = z.number().nullable().describe("Four-digit year, or null when the CV does not say.");

export const ParsedProfileSchema = z.object({
  fullName: z.string().nullable(),
  titles: z.array(z.string()).describe(`Job titles, at most ${L.titles}, most recent first.`),
  seniority: z.enum(SENIORITIES).nullable(),
  yearsExperience: z
    .number()
    .nullable()
    .describe("Years of professional experience, excluding education."),
  stack: z
    .array(z.string())
    .describe(`Canonical technology names, at most ${L.stack}, e.g. "TypeScript", "PostgreSQL".`),
  domains: z.array(z.string()).describe(`Business domains, at most ${L.domains}, e.g. "fintech".`),
  location: z.object({
    city: z.string().nullable(),
    country: z.string().nullable().describe("ISO 3166-1 alpha-2 code, upper case."),
  }),
  timezoneGuess: z
    .string()
    .nullable()
    .describe('IANA time zone derived from the location, e.g. "Europe/Chisinau".'),
  languages: z
    .array(
      z.object({
        name: z.string(),
        level: z.enum(ENGLISH_LEVELS).nullable(),
      }),
    )
    .describe(`At most ${L.languages}.`),
  englishLevel: z.enum(ENGLISH_LEVELS).nullable(),
  links: z
    .array(
      z.object({
        kind: z.enum(PROFILE_LINK_KINDS),
        url: z.string(),
      }),
    )
    .describe(`At most ${L.links}.`),
  roles: z
    .array(
      z.object({
        title: z.string(),
        company: z.string().nullable(),
        startYear: year,
        endYear: year,
        kind: z.enum(PROFILE_ROLE_KINDS),
      }),
    )
    .describe(`At most ${L.roles}, most recent first.`),
  education: z
    .array(
      z.object({
        institution: z.string(),
        degree: z.string().nullable(),
        field: z.string().nullable(),
        endYear: year,
      }),
    )
    .describe(`At most ${L.education}, most recent first.`),
});

export type ParsedProfile = z.infer<typeof ParsedProfileSchema>;

/** Every property optional at every depth; array items may themselves be partial. */
export type DeepPartial<T> = T extends readonly (infer U)[]
  ? DeepPartial<U>[]
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T;

/** A streamed, not yet validated snapshot of a `ParsedProfile`. */
export type ParsedProfilePartial = DeepPartial<ParsedProfile>;

const MIN_YEAR = 1950;
const MAX_YEARS_EXPERIENCE = 60;

function cleanString(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.replace(/\s+/g, " ").trim().slice(0, L.stringChars);
  return trimmed === "" ? null : trimmed;
}

function cleanList(values: readonly string[], max: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const value = cleanString(raw);
    if (value === null) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
    if (out.length === max) break;
  }
  return out;
}

function cleanCountry(value: string | null): string | null {
  const code = cleanString(value)?.toUpperCase() ?? null;
  if (code === null) return null;
  if (code.length === 2) return isCountryCode(code) ? code : null;
  if (code.length === 3) return ALPHA3_TO_ALPHA2.get(code) ?? null;
  return null;
}

function cleanTimezone(value: string | null): string | null {
  const zone = cleanString(value);
  if (zone === null) return null;
  try {
    // Throws RangeError for names that are not IANA zones; returns the canonical casing.
    const resolved = new Intl.DateTimeFormat("en-US", { timeZone: zone }).resolvedOptions()
      .timeZone;
    // Offset zones ("+02:00") are accepted by newer engines but are not IANA names.
    return resolved === "UTC" || /^[A-Za-z_]+(\/[A-Za-z0-9_+-]+)+$/.test(resolved)
      ? resolved
      : null;
  } catch {
    return null;
  }
}

function cleanYear(value: number | null): number | null {
  if (value === null || !Number.isInteger(value)) return null;
  const max = new Date().getUTCFullYear() + 1;
  return value >= MIN_YEAR && value <= max ? value : null;
}

function cleanYearsExperience(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  if (value < 0 || value > MAX_YEARS_EXPERIENCE) return null;
  return Math.round(value * 10) / 10;
}

function cleanUrl(value: string): string | null {
  const raw = cleanString(value);
  if (raw === null) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (!url.hostname.includes(".")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * Coerces a schema-valid profile into stored form. Never throws and never invents values: anything
 * it cannot make valid becomes `null` (scalar fields) or is dropped (list entries whose required
 * string is empty or whose link URL is unusable).
 */
export function normalizeParsedProfile(profile: ParsedProfile): ParsedProfile {
  const languages: ParsedProfile["languages"] = [];
  const languageNames = new Set<string>();
  for (const language of profile.languages) {
    const name = cleanString(language.name);
    if (name === null || languageNames.has(name.toLowerCase())) continue;
    languageNames.add(name.toLowerCase());
    languages.push({ name, level: language.level });
    if (languages.length === L.languages) break;
  }

  const links: ParsedProfile["links"] = [];
  const urls = new Set<string>();
  for (const link of profile.links) {
    const url = cleanUrl(link.url);
    if (url === null || urls.has(url)) continue;
    urls.add(url);
    links.push({ kind: link.kind, url });
    if (links.length === L.links) break;
  }

  const roles: ParsedProfile["roles"] = [];
  for (const role of profile.roles) {
    const title = cleanString(role.title);
    if (title === null) continue;
    roles.push({
      title,
      company: cleanString(role.company),
      startYear: cleanYear(role.startYear),
      endYear: cleanYear(role.endYear),
      kind: role.kind,
    });
    if (roles.length === L.roles) break;
  }

  const education: ParsedProfile["education"] = [];
  for (const entry of profile.education) {
    const institution = cleanString(entry.institution);
    if (institution === null) continue;
    education.push({
      institution,
      degree: cleanString(entry.degree),
      field: cleanString(entry.field),
      endYear: cleanYear(entry.endYear),
    });
    if (education.length === L.education) break;
  }

  return {
    fullName: cleanString(profile.fullName),
    titles: cleanList(profile.titles, L.titles),
    seniority: profile.seniority,
    yearsExperience: cleanYearsExperience(profile.yearsExperience),
    stack: cleanList(profile.stack, L.stack),
    domains: cleanList(profile.domains, L.domains),
    location: {
      city: cleanString(profile.location.city),
      country: cleanCountry(profile.location.country),
    },
    timezoneGuess: cleanTimezone(profile.timezoneGuess),
    languages,
    englishLevel: profile.englishLevel,
    links,
    roles,
    education,
  };
}
