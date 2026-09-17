import { getDb } from "@pemby/db";
import type { TeaserInput } from "./index";
import { teaserInputFromProfile, type TeaserProfileRow } from "./input";

// Raw SQL, like lib/profile.ts (no drizzle-orm operators in apps/web).

/** The user's teaser defaults: their profile, falling back to their latest parsed CV. */
export async function loadTeaserInput(userId: string): Promise<TeaserInput> {
  const client = getDb().$client;
  const [profile, cv] = await Promise.all([
    client.query<TeaserProfileRow>(
      `select residence_country, ways_of_working::text[] as ways_of_working,
              seniority::text as seniority, titles, stack
         from profiles where user_id = $1`,
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
