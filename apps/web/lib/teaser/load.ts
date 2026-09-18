import { getDb } from "@pemby/db";
import type { TeaserInput } from "./index";
import { teaserInputFromProfile, type TeaserProfileRow } from "./input";

// Raw SQL, like lib/profile.ts (no drizzle-orm operators in apps/web).

/**
 * The user's teaser defaults: their profile, falling back to their latest parsed CV.
 *
 * The yellow opt-in (PLAN D2, D13 amended 2026-09-17) is read from `profiles.include_yellow` and
 * ANDed here with "this is a real account". An anonymous visitor has no profile they could have
 * opted in with, so their teaser stays green-only whatever the row says — the tier the person sees
 * before they have made any choice is not left to a default value on a row the CV parser created.
 */
export async function loadTeaserInput(userId: string): Promise<TeaserInput> {
  const client = getDb().$client;
  const [profile, cv] = await Promise.all([
    client.query<TeaserProfileRow>(
      `select p.residence_country, p.ways_of_working::text[] as ways_of_working,
              p.seniority::text as seniority, p.titles, p.stack,
              p.years_experience,
              p.employment_types::text[] as employment_types,
              p.dealbreakers, p.min_rate, p.min_rate_currency,
              p.min_rate_period::text as min_rate_period, p.hide_no_salary,
              p.timezone, p.min_overlap_hours,
              (p.include_yellow and not coalesce(u.is_anonymous, false)) as include_yellow
         from profiles p
         join "user" u on u.id = p.user_id
        where p.user_id = $1`,
      [userId],
    ),
    client.query<{ parsed: unknown }>(
      `select parsed from cv_files
        where user_id = $1 and parse_status = 'parsed' and parsed is not null
        order by parsed_at desc nulls last, created_at desc
        limit 1`,
      [userId],
    ),
  ]);
  return teaserInputFromProfile(profile.rows[0] ?? null, cv.rows[0]?.parsed ?? null);
}
