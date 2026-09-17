// Hand validation of a `PATCH /api/profile` body. `zod` is not a dependency of @pemby/web (it
// resolves only inside the packages that declare it), so this follows the shape of
// `lib/teaser/query.ts`: every present key must be valid, and one bad key rejects the whole patch
// with the key's name. Nothing here produces a user-facing string; the client maps the code.

import { isCountryCode } from "@pemby/core";
import {
  EMPLOYMENT_TYPES,
  ENGLISH_LEVELS,
  PAY_PERIODS,
  PERMIT_KINDS,
  PROFILE_LIMITS,
  PROFILE_PATCH_KEYS,
  SENIORITIES,
  WAYS_OF_WORKING,
  type PermitView,
  type ProfilePatch,
  type ProfilePatchKey,
} from "./view";

export type ParsedPatch = { ok: true; patch: ProfilePatch } | { ok: false; field: string };

const L = PROFILE_LIMITS;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function oneOf<T extends string>(list: readonly T[], value: unknown): T | undefined {
  return typeof value === "string" && (list as readonly string[]).includes(value)
    ? (value as T)
    : undefined;
}

/** Trimmed, non-empty, within `max` characters, de-duplicated case-insensitively, capped at `count`. */
function stringList(value: unknown, count: number, max: number): string[] | undefined {
  if (!Array.isArray(value) || value.length > count) return undefined;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of value) {
    if (typeof raw !== "string") return undefined;
    const item = raw.replace(/\s+/g, " ").trim();
    if (item === "" || item.length > max) return undefined;
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function countryList(value: unknown, count: number): string[] | undefined {
  if (!Array.isArray(value) || value.length > count) return undefined;
  const out = new Set<string>();
  for (const raw of value) {
    if (typeof raw !== "string") return undefined;
    const code = raw.trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(code) || !isCountryCode(code)) return undefined;
    out.add(code);
  }
  return [...out];
}

function enumList<T extends string>(list: readonly T[], value: unknown): T[] | undefined {
  if (!Array.isArray(value) || value.length > list.length) return undefined;
  const out = new Set<T>();
  for (const raw of value) {
    const item = oneOf(list, raw);
    if (item === undefined) return undefined;
    out.add(item);
  }
  return [...out];
}

/** IANA zone names only: `Intl` accepts offset forms ("+02:00") that are not zones. */
function timezone(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const zone = value.trim();
  if (zone === "") return null;
  try {
    const resolved = new Intl.DateTimeFormat("en-US", { timeZone: zone }).resolvedOptions()
      .timeZone;
    return resolved === "UTC" || /^[A-Za-z_]+(\/[A-Za-z0-9_+-]+)+$/.test(resolved)
      ? resolved
      : undefined;
  } catch {
    return undefined;
  }
}

function permits(value: unknown): PermitView[] | undefined {
  if (!Array.isArray(value) || value.length > L.permits) return undefined;
  const out: PermitView[] = [];
  for (const raw of value) {
    if (!isRecord(raw)) return undefined;
    const country = typeof raw.country === "string" ? raw.country.trim().toUpperCase() : "";
    if (!/^[A-Z]{2}$/.test(country) || !isCountryCode(country)) return undefined;
    const kind = oneOf(PERMIT_KINDS, raw.kind);
    if (kind === undefined) return undefined;
    const permit: PermitView = { country, kind };
    if (raw.expiresOn !== undefined && raw.expiresOn !== null && raw.expiresOn !== "") {
      if (typeof raw.expiresOn !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw.expiresOn)) {
        return undefined;
      }
      if (Number.isNaN(Date.parse(raw.expiresOn))) return undefined;
      permit.expiresOn = raw.expiresOn;
    }
    // One entry per country and kind; a duplicate is a double tap, not an error.
    if (out.some((p) => p.country === permit.country && p.kind === permit.kind)) continue;
    out.push(permit);
  }
  return out;
}

function wholeNumber(value: unknown, max: number): number | null | undefined {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > max) {
    return undefined;
  }
  return value;
}

/**
 * Reads one key. Returns `undefined` when the value is not acceptable, so the caller can name the
 * field; a `null` result is a real value ("cleared").
 */
function readKey(key: ProfilePatchKey, value: unknown): unknown {
  switch (key) {
    case "displayName": {
      if (value === null) return null;
      if (typeof value !== "string") return undefined;
      const name = value.replace(/\s+/g, " ").trim();
      if (name.length > L.displayNameChars) return undefined;
      return name === "" ? null : name;
    }
    case "citizenships":
      return countryList(value, L.citizenships);
    case "residenceCountry": {
      if (value === null || value === "") return null;
      if (typeof value !== "string") return undefined;
      const code = value.trim().toUpperCase();
      return /^[A-Z]{2}$/.test(code) && isCountryCode(code) ? code : undefined;
    }
    case "timezone":
      return timezone(value);
    case "minOverlapHours":
      return wholeNumber(value, L.minOverlapHours);
    case "hasOwnCompany":
    case "hideNoSalary":
      return typeof value === "boolean" ? value : undefined;
    case "permits":
      return permits(value);
    case "englishLevel":
      return value === null ? null : oneOf(ENGLISH_LEVELS, value);
    case "waysOfWorking":
      return enumList(WAYS_OF_WORKING, value);
    case "employmentTypes":
      return enumList(EMPLOYMENT_TYPES, value);
    case "titles":
      return stringList(value, L.titles, L.titleChars);
    case "seniority":
      return value === null ? null : oneOf(SENIORITIES, value);
    case "stack":
      return stringList(value, L.stack, L.stackChars);
    case "dealbreakers":
      return stringList(value, L.dealbreakers, L.dealbreakerChars);
    case "minRate":
      return wholeNumber(value, L.minRate);
    case "minRateCurrency": {
      if (value === null || value === "") return null;
      if (typeof value !== "string") return undefined;
      const code = value.trim().toUpperCase();
      return /^[A-Z]{3}$/.test(code) ? code : undefined;
    }
    case "minRatePeriod":
      return value === null ? null : oneOf(PAY_PERIODS, value);
  }
}

/**
 * Validates a `PATCH /api/profile` body. An empty patch, an unknown key, or a key whose value does
 * not validate is a rejection; `field` names the first offender (a stable key name, never a
 * sentence).
 */
export function parseProfilePatch(body: unknown): ParsedPatch {
  if (!isRecord(body)) return { ok: false, field: "body" };
  const keys = Object.keys(body);
  if (keys.length === 0) return { ok: false, field: "body" };

  const patch: Record<string, unknown> = {};
  for (const key of keys) {
    if (!(PROFILE_PATCH_KEYS as readonly string[]).includes(key)) return { ok: false, field: key };
    const parsed = readKey(key as ProfilePatchKey, body[key]);
    if (parsed === undefined) return { ok: false, field: key };
    patch[key] = parsed;
  }
  return { ok: true, patch: patch as ProfilePatch };
}
