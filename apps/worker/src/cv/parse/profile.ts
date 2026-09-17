// Pre-fills `profiles` from a parsed CV. Fills only columns that are null (or empty text) and
// arrays that are empty; a value the user already has is never overwritten.
import {
  defaultWaysFor,
  fromDbSeniority,
  toDbSeniority,
  toDbWay,
  type ParsedProfile,
} from "@pemby/core";
import { schema, type Db } from "@pemby/db";
import { eq } from "drizzle-orm";

const { profiles } = schema;

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type ProfilePatch = Partial<typeof profiles.$inferInsert>;

const blank = (value: string | null) => value === null || value.trim() === "";

/**
 * Longest display name stored from a CV. Matches the limit the profile API accepts
 * (`displayNameChars` in apps/web/app/api/profile/_lib/view.ts); the worker cannot import web code,
 * so the number is repeated here on purpose. `normalizeParsedProfile` already trimmed the name.
 */
const DISPLAY_NAME_CHARS = 80;

/** Returns the names of the columns it filled. Runs inside the caller's transaction. */
export async function fillProfileFromCv(
  tx: Tx,
  userId: string,
  parsed: ParsedProfile,
): Promise<string[]> {
  await tx.insert(profiles).values({ userId }).onConflictDoNothing({ target: profiles.userId });
  const [current] = await tx
    .select()
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .for("update");
  if (!current) return [];

  const patch: ProfilePatch = {};
  // The whole name as the person wrote it on their own CV; shown back only to them for now.
  if (blank(current.displayName) && parsed.fullName !== null) {
    const name = parsed.fullName.trim().slice(0, DISPLAY_NAME_CHARS).trim();
    if (name !== "") patch.displayName = name;
  }
  if (current.titles.length === 0 && parsed.titles.length > 0) patch.titles = parsed.titles;
  if (current.seniority === null && parsed.seniority !== null) {
    patch.seniority = toDbSeniority(parsed.seniority);
  }
  if (current.yearsExperience === null && parsed.yearsExperience !== null) {
    patch.yearsExperience = Math.round(parsed.yearsExperience);
  }
  if (current.stack.length === 0 && parsed.stack.length > 0) patch.stack = parsed.stack;
  if (blank(current.residenceCountry) && parsed.location.country !== null) {
    patch.residenceCountry = parsed.location.country;
  }
  // The CV's timezone describes the CV's location: only use it when the profile's country is that
  // same country (filled just now, or already equal).
  const country = patch.residenceCountry ?? current.residenceCountry;
  if (
    blank(current.timezone) &&
    parsed.timezoneGuess !== null &&
    parsed.location.country !== null &&
    country === parsed.location.country
  ) {
    patch.timezone = parsed.timezoneGuess;
  }
  if (current.englishLevel === null && parsed.englishLevel !== null) {
    patch.englishLevel = parsed.englishLevel;
  }
  if (current.waysOfWorking.length === 0) {
    // The user's own seniority, when set, decides the defaults over the parsed one.
    const seniority =
      current.seniority !== null ? fromDbSeniority(current.seniority) : parsed.seniority;
    patch.waysOfWorking = defaultWaysFor(seniority).map(toDbWay);
  }

  const filled = Object.keys(patch);
  if (filled.length > 0) {
    await tx.update(profiles).set(patch).where(eq(profiles.id, current.id));
  }
  return filled;
}
