import { getDb } from "@pemby/db";

// Raw SQL for the same reason as lib/auth/claim.ts (no drizzle-orm operators in apps/web).

export const DISPLAY_NAME_MAX = 80;

/** Body of GET and PATCH /api/profile. */
export type ProfileResponse = { displayName: string | null };

export async function getDisplayName(userId: string): Promise<string | null> {
  const { rows } = await getDb().$client.query<{ display_name: string | null }>(
    "select display_name from profiles where user_id = $1",
    [userId],
  );
  return rows[0]?.display_name ?? null;
}

/**
 * Set `profiles.display_name`, creating the profile row if the user has none. Returns null when
 * the user no longer exists (for example an anonymous user claimed while this request was in
 * flight), so nothing is recreated for a deleted user. The foreign key also blocks on a claim's
 * row lock and then fails if the claim deleted the user.
 */
export async function setDisplayName(
  userId: string,
  displayName: string,
): Promise<ProfileResponse | null> {
  const { rows } = await getDb().$client.query<{ display_name: string | null }>(
    `insert into profiles (user_id, display_name)
     select $1, $2 where exists (select 1 from "user" where id = $1)
     on conflict (user_id) do update set display_name = excluded.display_name, updated_at = now()
     returning display_name`,
    [userId, displayName],
  );
  const row = rows[0];
  return row ? { displayName: row.display_name } : null;
}
