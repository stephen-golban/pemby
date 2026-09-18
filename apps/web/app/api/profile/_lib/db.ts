// Database side of `/api/profile`. Raw SQL on the shared pool for the same reason as
// `lib/auth/claim.ts` and `lib/teaser/load.ts`: apps/web cannot import drizzle-orm operators that
// type-check against @pemby/db's schema (pnpm resolves a second drizzle-orm copy for web). Table
// and column names are the ones in `packages/db/src/schema/profiles.ts`.

import {
  DB_SENIORITIES,
  DB_WAYS_OF_WORKING,
  defaultWaysFor,
  fromDbSeniority,
  fromDbWay,
  isCountryCode,
  toDbSeniority,
  toDbWay,
  type DbSeniority,
  type DbWayOfWorking,
  type EmploymentType,
  type EnglishLevel,
  type Seniority,
  type WayOfWorking,
} from "@pemby/core";
import { createHash } from "node:crypto";
import { getDb } from "@pemby/db";
import {
  ENGLISH_LEVELS,
  PAY_PERIODS,
  PERMIT_KINDS,
  SENIORITIES,
  type PayPeriod,
  type PermitKind,
  type PermitView,
  type ProfilePatch,
  type ProfilePatchKey,
  type ProfileView,
} from "./view";

/**
 * `employment_type` pg enum values. Core spells these with hyphens and ships no mapper for them
 * (unlike ways of working and seniority, which have `toDbWay` / `toDbSeniority` in
 * `packages/core/src/profile/enums.ts`). The two `satisfies` below make a drift in either list a
 * type error. Suggested for a later order: move this pair into `@pemby/core` beside the others.
 */
const DB_EMPLOYMENT_TYPES = ["full_time", "part_time", "contract_to_hire"] as const;
type DbEmploymentType = (typeof DB_EMPLOYMENT_TYPES)[number];

const EMPLOYMENT_TO_DB = {
  "full-time": "full_time",
  "part-time": "part_time",
  "contract-to-hire": "contract_to_hire",
} as const satisfies Record<EmploymentType, DbEmploymentType>;

const EMPLOYMENT_FROM_DB = {
  full_time: "full-time",
  part_time: "part-time",
  contract_to_hire: "contract-to-hire",
} as const satisfies Record<DbEmploymentType, EmploymentType>;

// Reading ----------------------------------------------------------------

interface ProfileRow {
  display_name: string | null;
  citizenships: string[] | null;
  residence_country: string | null;
  timezone: string | null;
  min_overlap_hours: number | null;
  has_own_company: boolean;
  permits: unknown;
  english_level: string | null;
  ways_of_working: string[] | null;
  employment_types: string[] | null;
  titles: string[] | null;
  seniority: string | null;
  stack: string[] | null;
  dealbreakers: string[] | null;
  min_rate: number | null;
  min_rate_currency: string | null;
  min_rate_period: string | null;
  hide_no_salary: boolean;
  onboarding_completed_at: Date | null;
}

const SELECT_PROFILE = `
  select display_name, citizenships, residence_country, timezone, min_overlap_hours,
         has_own_company, permits, english_level::text as english_level,
         ways_of_working::text[] as ways_of_working,
         employment_types::text[] as employment_types,
         titles, seniority::text as seniority, stack, dealbreakers,
         min_rate, min_rate_currency, min_rate_period::text as min_rate_period,
         hide_no_salary, onboarding_completed_at
    from profiles where user_id = $1`;

const isIn = <T extends string>(list: readonly T[], value: unknown): value is T =>
  typeof value === "string" && (list as readonly string[]).includes(value);

const strings = (value: unknown): string[] =>
  Array.isArray(value)
    ? value
        .filter((s): s is string => typeof s === "string" && s.trim() !== "")
        .map((s) => s.trim())
    : [];

function countryOf(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const code = value.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) && isCountryCode(code) ? code : null;
}

/** Stored permits, dropping anything a hand edit or an older shape left unreadable. */
function permitsOf(value: unknown): PermitView[] {
  if (!Array.isArray(value)) return [];
  const out: PermitView[] = [];
  for (const raw of value) {
    if (typeof raw !== "object" || raw === null) continue;
    const entry = raw as Record<string, unknown>;
    const country = countryOf(entry.country);
    if (!country || !isIn<PermitKind>(PERMIT_KINDS, entry.kind)) continue;
    const permit: PermitView = { country, kind: entry.kind };
    if (typeof entry.expiresOn === "string" && /^\d{4}-\d{2}-\d{2}$/.test(entry.expiresOn)) {
      permit.expiresOn = entry.expiresOn;
    }
    out.push(permit);
  }
  return out;
}

/** The fields of a parsed CV the profile can be pre-filled from; read defensively. */
interface ParsedFallback {
  fullName: string | null;
  titles: string[];
  seniority: Seniority | null;
  stack: string[];
  country: string | null;
  timezone: string | null;
  englishLevel: EnglishLevel | null;
}

function parsedFallback(parsed: unknown): ParsedFallback {
  const p =
    typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
  const location =
    typeof p.location === "object" && p.location !== null
      ? (p.location as Record<string, unknown>)
      : {};
  return {
    fullName: typeof p.fullName === "string" && p.fullName.trim() !== "" ? p.fullName.trim() : null,
    titles: strings(p.titles),
    seniority: isIn<Seniority>(SENIORITIES, p.seniority) ? p.seniority : null,
    stack: strings(p.stack),
    country: countryOf(location.country),
    timezone: typeof p.timezoneGuess === "string" ? p.timezoneGuess : null,
    englishLevel: isIn<EnglishLevel>(ENGLISH_LEVELS, p.englishLevel) ? p.englishLevel : null,
  };
}

/**
 * The profile as the onboarding flow and the profile page see it.
 *
 * **Until onboarding is finished**, fields the `profiles` row leaves empty fall back, field by
 * field, to the newest parsed CV — the same fallback `lib/teaser/input.ts` applies, so the count on
 * screen is computed from the values on screen. The parse job normally fills the row itself (phase
 * 06 contract, flow step 5); this covers a profile claimed before its parse finished, and a CV
 * parsed under an older code path. Accepting a step writes the shown values back, so the fallback
 * is visible for one step at most.
 *
 * **Once `onboarding_completed_at` is set**, the row is the whole truth and no fallback applies.
 * Without that switch there is no way to say "none": clearing every way of working, or every title,
 * would silently come back as the CV's values (or `defaultWaysFor`) on the next read, and the
 * person could never narrow what they are shown.
 */
export async function loadProfileView(userId: string, anonymous: boolean): Promise<ProfileView> {
  const client = getDb().$client;
  const [profile, cv] = await Promise.all([
    client.query<ProfileRow>(SELECT_PROFILE, [userId]),
    client.query<{ parsed: unknown }>(
      `select parsed from cv_files
        where user_id = $1 and parse_status = 'parsed' and parsed is not null
        order by parsed_at desc nulls last, created_at desc
        limit 1`,
      [userId],
    ),
  ]);
  return toView(profile.rows[0] ?? null, cv.rows[0]?.parsed ?? null, anonymous);
}

function toView(row: ProfileRow | null, parsed: unknown, anonymous: boolean): ProfileView {
  const settled = row !== null && row.onboarding_completed_at !== null;
  const cvProfile = settled ? parsedFallback(null) : parsedFallback(parsed);

  const titles = strings(row?.titles);
  const stack = strings(row?.stack);
  const seniority: Seniority | null = isIn<DbSeniority>(DB_SENIORITIES, row?.seniority)
    ? fromDbSeniority(row.seniority)
    : cvProfile.seniority;

  const ways = (row?.ways_of_working ?? [])
    .filter((w): w is DbWayOfWorking => isIn(DB_WAYS_OF_WORKING, w))
    .map(fromDbWay);

  return {
    displayName: row?.display_name ?? cvProfile.fullName,
    citizenships: (row?.citizenships ?? []).map(countryOf).filter((c): c is string => c !== null),
    residenceCountry: countryOf(row?.residence_country) ?? cvProfile.country,
    timezone: row?.timezone ?? cvProfile.timezone,
    minOverlapHours: row?.min_overlap_hours ?? null,
    hasOwnCompany: row?.has_own_company ?? false,
    permits: permitsOf(row?.permits),
    englishLevel: isIn<EnglishLevel>(ENGLISH_LEVELS, row?.english_level)
      ? row.english_level
      : cvProfile.englishLevel,
    waysOfWorking: ways.length > 0 ? [...new Set(ways)] : settled ? [] : defaultWaysFor(seniority),
    employmentTypes: (row?.employment_types ?? [])
      .filter((t): t is DbEmploymentType => isIn(DB_EMPLOYMENT_TYPES, t))
      .map((t) => EMPLOYMENT_FROM_DB[t]),
    titles: titles.length > 0 ? titles : cvProfile.titles,
    seniority,
    stack: stack.length > 0 ? stack : cvProfile.stack,
    dealbreakers: strings(row?.dealbreakers),
    minRate: row?.min_rate ?? null,
    minRateCurrency: row?.min_rate_currency ?? null,
    minRatePeriod: isIn<PayPeriod>(PAY_PERIODS, row?.min_rate_period) ? row.min_rate_period : null,
    hideNoSalary: row?.hide_no_salary ?? false,
    onboardingCompletedAt: row?.onboarding_completed_at?.toISOString() ?? null,
    anonymous,
  };
}

// Writing ----------------------------------------------------------------

/** Column name and the cast each patch key writes through. */
const COLUMNS: Record<ProfilePatchKey, { column: string; cast: string }> = {
  displayName: { column: "display_name", cast: "text" },
  citizenships: { column: "citizenships", cast: "text[]" },
  residenceCountry: { column: "residence_country", cast: "text" },
  timezone: { column: "timezone", cast: "text" },
  minOverlapHours: { column: "min_overlap_hours", cast: "smallint" },
  hasOwnCompany: { column: "has_own_company", cast: "boolean" },
  permits: { column: "permits", cast: "jsonb" },
  englishLevel: { column: "english_level", cast: "english_level" },
  waysOfWorking: { column: "ways_of_working", cast: "way_of_working[]" },
  employmentTypes: { column: "employment_types", cast: "employment_type[]" },
  titles: { column: "titles", cast: "text[]" },
  seniority: { column: "seniority", cast: "seniority" },
  stack: { column: "stack", cast: "text[]" },
  dealbreakers: { column: "dealbreakers", cast: "text[]" },
  minRate: { column: "min_rate", cast: "integer" },
  minRateCurrency: { column: "min_rate_currency", cast: "text" },
  minRatePeriod: { column: "min_rate_period", cast: "pay_period" },
  hideNoSalary: { column: "hide_no_salary", cast: "boolean" },
};

/** Core spelling on the way in, database spelling on the way out. */
function toParam(key: ProfilePatchKey, value: unknown): unknown {
  switch (key) {
    case "waysOfWorking":
      return (value as WayOfWorking[]).map(toDbWay);
    case "employmentTypes":
      return (value as EmploymentType[]).map((t) => EMPLOYMENT_TO_DB[t]);
    case "seniority":
      return value === null ? null : toDbSeniority(value as Seniority);
    case "permits":
      return JSON.stringify(value);
    default:
      return value;
  }
}

/**
 * Applies a validated patch and returns the profile as it now stands. `null` means the user row is
 * gone (an anonymous session claimed or deleted while this request was in flight), so nothing is
 * recreated for a user who no longer exists — the same guard `lib/profile.ts` uses.
 */
export async function patchProfile(
  userId: string,
  patch: ProfilePatch,
  anonymous: boolean,
): Promise<ProfileView | null> {
  const keys = Object.keys(patch) as ProfilePatchKey[];
  if (keys.length === 0) return loadProfileView(userId, anonymous);

  const client = getDb().$client;
  await client.query(
    `insert into profiles (user_id) select $1 where exists (select 1 from "user" where id = $1)
     on conflict (user_id) do nothing`,
    [userId],
  );

  const params: unknown[] = [userId];
  const assignments = keys.map((key) => {
    const { column, cast } = COLUMNS[key];
    params.push(toParam(key, patch[key]));
    return `${column} = $${params.length}::${cast}`;
  });

  const updated = await client.query(
    `update profiles set ${assignments.join(", ")}, updated_at = now() where user_id = $1`,
    params,
  );
  if (updated.rowCount === 0) return null;
  return loadProfileView(userId, anonymous);
}

/** Stamps `onboarding_completed_at` once; a second call leaves the first timestamp alone. */
export async function completeOnboarding(
  userId: string,
  anonymous: boolean,
): Promise<ProfileView | null> {
  const client = getDb().$client;
  await client.query(
    `insert into profiles (user_id) select $1 where exists (select 1 from "user" where id = $1)
     on conflict (user_id) do nothing`,
    [userId],
  );
  const updated = await client.query(
    `update profiles set onboarding_completed_at = coalesce(onboarding_completed_at, now()),
                         updated_at = now()
      where user_id = $1`,
    [userId],
  );
  if (updated.rowCount === 0) return null;
  return loadProfileView(userId, anonymous);
}

// Export -----------------------------------------------------------------

export interface CvExportRow {
  id: string;
  source: string;
  file_name: string;
  mime_type: string;
  size_bytes: string | number;
  sha256: string;
  parse_status: string;
  error_code: string | null;
  parse_model: string | null;
  parse_prompt_version: string | null;
  parsed: unknown;
  parsed_at: Date | null;
  expires_at: Date | null;
  created_at: Date;
}

export interface ChannelExportRow {
  type: string;
  address: string;
  enabled: boolean;
  verified_at: Date | null;
  dead_at: Date | null;
  dead_reason: string | null;
  quiet_start_minute: number | null;
  quiet_end_minute: number | null;
  timezone: string | null;
  created_at: Date;
}

/** Lower-case hex SHA-256 of a value, truncated: enough to tell two rows apart, not enough to be one. */
function fingerprint(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

/**
 * A delivery channel, as the export shows it (phase 08, PLAN D8).
 *
 * **The address.** A Telegram chat id and an email address are facts about the person and go out
 * in full. A web-push endpoint does not: it is a bearer URL minted by a push service, and the row
 * gives its origin plus a fingerprint instead — enough to tell two browsers apart, which is the
 * only thing a reader could want from it, and not enough to address either of them.
 *
 * **`push_keys` is absent on purpose, and this is the one judgement call in the file.** The
 * `p256dh` and `auth` pair is not information about the person at all: it is ECDH key material the
 * browser generated for one transport, and it is the half of the message encryption that is meant
 * to stay on the two ends. An export is a file people mail to themselves and leave in Downloads;
 * putting live credentials in it turns a lost laptop into a way to send someone notifications that
 * look like ours. Nothing is lost by leaving them out — they mean nothing to a reader, they cannot
 * be imported anywhere, and the subscription they belong to is revoked by switching push off in
 * the browser that made it. Same reasoning, and the same precedent, as `bucket_key` above.
 */
function channelExport(row: ChannelExportRow) {
  const push = row.type === "push";
  let address = row.address;
  if (push) {
    let origin = "unknown";
    try {
      origin = new URL(row.address).origin;
    } catch {
      origin = "unknown";
    }
    address = `${origin} (${fingerprint(row.address)})`;
  }
  return {
    type: row.type,
    address,
    /** True when the browser's encryption keys are held for this channel; the keys are not exported. */
    hasPushKeys: push,
    enabled: row.enabled,
    verifiedAt: row.verified_at?.toISOString() ?? null,
    deadAt: row.dead_at?.toISOString() ?? null,
    deadReason: row.dead_reason,
    quietStartMinute: row.quiet_start_minute,
    quietEndMinute: row.quiet_end_minute,
    timezone: row.timezone,
    createdAt: row.created_at.toISOString(),
  };
}

/**
 * Everything "Export my data" hands back: the profile as the product uses it, one entry per CV with
 * its metadata and the profile parsed out of it, and the delivery channels the account is reachable
 * on. Deliberately absent: `bucket_key` and any bucket URL (objects are private and no presigned URL
 * is ever handed to a browser), the raw extracted CV text, and push subscription keys (see
 * `channelExport`).
 *
 * Deletion needs nothing added for phase 08: `channels.user_id` and `delivery_log.user_id` are both
 * `ON DELETE cascade` from `user.id` (`packages/db/src/schema/delivery.ts:41,88`, applied in
 * `packages/db/drizzle/0001_*.sql:434-435`), so `deleteUserAndCvRows` below already takes them.
 */
export async function loadExport(userId: string, anonymous: boolean) {
  const client = getDb().$client;
  const [profile, cvs, account, channels] = await Promise.all([
    loadProfileView(userId, anonymous),
    client.query<CvExportRow>(
      `select id, source, file_name, mime_type, size_bytes, sha256,
              parse_status::text as parse_status, error_code, parse_model, parse_prompt_version,
              parsed, parsed_at, expires_at, created_at
         from cv_files where user_id = $1 order by created_at`,
      [userId],
    ),
    client.query<{
      id: string;
      email: string;
      name: string;
      email_verified: boolean;
      created_at: Date;
    }>(`select id, email, name, email_verified, created_at from "user" where id = $1`, [userId]),
    client.query<ChannelExportRow>(
      `select type::text as type, address, enabled, verified_at, dead_at, dead_reason,
              quiet_start_minute, quiet_end_minute, timezone, created_at
         from channels where user_id = $1 order by created_at`,
      [userId],
    ),
  ]);

  const user = account.rows[0];
  return {
    exportedAt: new Date().toISOString(),
    account: user
      ? {
          id: user.id,
          email: user.email,
          name: user.name,
          emailVerified: user.email_verified,
          createdAt: user.created_at.toISOString(),
          anonymous,
        }
      : null,
    profile,
    cvFiles: cvs.rows.map((row) => ({
      id: row.id,
      source: row.source,
      fileName: row.file_name,
      mimeType: row.mime_type,
      sizeBytes: Number(row.size_bytes),
      sha256: row.sha256,
      parseStatus: row.parse_status,
      errorCode: row.error_code,
      parseModel: row.parse_model,
      parsePromptVersion: row.parse_prompt_version,
      parsedAt: row.parsed_at?.toISOString() ?? null,
      expiresAt: row.expires_at?.toISOString() ?? null,
      createdAt: row.created_at.toISOString(),
      parsed: row.parsed,
    })),
    channels: channels.rows.map(channelExport),
  };
}

// Deletion ---------------------------------------------------------------

/** Bucket keys of this user's CV objects, so they can be removed before the rows are. */
export async function listCvBucketKeys(userId: string): Promise<string[]> {
  const { rows } = await getDb().$client.query<{ bucket_key: string | null }>(
    "select bucket_key from cv_files where user_id = $1",
    [userId],
  );
  return rows.map((r) => r.bucket_key).filter((key): key is string => key !== null);
}

/**
 * Deletes this user's CV rows and then the user, in one transaction. `cv_files.user_id` is ON
 * DELETE RESTRICT (a row points at a bucket object Postgres cannot delete), so the rows have to go
 * first; everything else — sessions, accounts, profiles and their embeddings, pending claims,
 * matches, applications, channels — cascades with the user row.
 *
 * Every statement is scoped by the session's own user id, so no other user's rows are reachable.
 * Returns false when the user is already gone.
 */
export async function deleteUserAndCvRows(userId: string): Promise<boolean> {
  const client = await getDb().$client.connect();
  try {
    await client.query("begin");
    const locked = await client.query(`select 1 from "user" where id = $1 for update`, [userId]);
    if (locked.rowCount === 0) {
      await client.query("rollback");
      return false;
    }
    await client.query("delete from cv_files where user_id = $1", [userId]);
    await client.query(`delete from "user" where id = $1`, [userId]);
    await client.query("commit");
    return true;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
