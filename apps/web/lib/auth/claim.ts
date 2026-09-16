import { getDb } from "@pemby/db";

// Raw SQL on the shared pool: apps/web cannot import drizzle-orm operators that type-check against
// @pemby/db's schema (pnpm resolves a second drizzle-orm copy for web). Table and column names are
// the ones in packages/db/src/schema.

/**
 * Move an anonymous user's data to the account they just signed up or signed in with (PLAN D4).
 * Follows the contract above `cvFiles` in packages/db/src/schema/profiles.ts, in one transaction:
 *
 * 1. Lock the anonymous user row, so concurrent writes that reference it (foreign keys take a key
 *    share lock) wait for this transaction.
 * 2. Re-parent every user-owned row; for per-user unique keys the target's row wins.
 * 3. Delete the anonymous user (sessions and leftovers cascade) before commit, so in-flight
 *    anonymous requests stop authenticating and blocked writes fail their foreign key instead of
 *    recreating data. `disableDeleteAnonymousUser` is set in lib/auth/server.ts for this reason.
 *
 * If it throws, nothing changes and the request fails; signing in again from the same browser
 * retries the claim.
 */
export async function claimAnonymousUser(
  anonymousUserId: string,
  newUserId: string,
): Promise<void> {
  if (anonymousUserId === newUserId) return;
  const ids = [anonymousUserId, newUserId];

  const client = await getDb().$client.connect();
  const run = (text: string) => client.query(text, ids);
  try {
    await client.query("begin");

    const locked = await client.query(
      `select 1 from "user" where id = $1 and is_anonymous for update`,
      [anonymousUserId],
    );
    if (locked.rowCount === 0) {
      // Already claimed or deleted by a concurrent request.
      await client.query("rollback");
      return;
    }

    // Profiles: one per user. Keep the target's if it has one; the anonymous profile's embedding
    // cascades with it.
    await run(`delete from profiles where user_id = $1
                 and exists (select 1 from profiles where user_id = $2)`);
    await run("update profiles set user_id = $2, updated_at = now() where user_id = $1");

    // CV files: re-parent and stop the 24h expiry.
    await run(
      "update cv_files set user_id = $2, expires_at = null, updated_at = now() where user_id = $1",
    );

    // Matches: unique per (user, job), the target's match wins. Before deleting an anonymous
    // duplicate, point everything that references it at the target's match. Sent delivery rows
    // are unique per (match, channel type); those the target already has cascade with the
    // duplicate.
    const duplicateMatches = `select a.id as anon_match_id, t.id as target_match_id
        from matches a join matches t on t.job_id = a.job_id and t.user_id = $2
       where a.user_id = $1`;
    await run(`update applications x set match_id = d.target_match_id
                 from (${duplicateMatches}) d where x.match_id = d.anon_match_id`);
    await run(`update kits x set match_id = d.target_match_id
                 from (${duplicateMatches}) d where x.match_id = d.anon_match_id`);
    await run(`update delivery_log x set match_id = d.target_match_id
                 from (${duplicateMatches}) d
                where x.match_id = d.anon_match_id
                  and not (x.status = 'sent' and exists (
                    select 1 from delivery_log s
                     where s.match_id = d.target_match_id and s.channel_type = x.channel_type
                       and s.status = 'sent'))`);
    await run(`delete from matches a where a.user_id = $1
                 and exists (select 1 from matches t where t.user_id = $2 and t.job_id = a.job_id)`);
    await run("update matches set user_id = $2, updated_at = now() where user_id = $1");

    // Applications: unique per (user, job), the target's row wins.
    await run(`delete from applications a where a.user_id = $1
                 and exists (select 1 from applications t where t.user_id = $2 and t.job_id = a.job_id)`);
    await run("update applications set user_id = $2, updated_at = now() where user_id = $1");

    // Rows without per-user uniqueness. Channels are unique on (type, address), which does not
    // include the user, so re-parenting cannot collide.
    await run("update kits set user_id = $2 where user_id = $1");
    await run("update channels set user_id = $2, updated_at = now() where user_id = $1");
    await run("update delivery_log set user_id = $2 where user_id = $1");
    await run("update passes set user_id = $2, updated_at = now() where user_id = $1");
    await run("update payments set user_id = $2, updated_at = now() where user_id = $1");
    await run("update ai_usage set user_id = $2 where user_id = $1");

    // Flags: one per (job, user, reason); the target's flag wins.
    await run(`delete from flags a where a.user_id = $1
                 and exists (select 1 from flags t
                              where t.user_id = $2 and t.job_id = a.job_id and t.reason = a.reason)`);
    await run("update flags set user_id = $2, updated_at = now() where user_id = $1");

    // Referrals, referee side: `referee_user_id` is unique and nobody refers themselves. Drop the
    // anonymous referral if the target is already a referee or was its referrer. Referrals where
    // the anonymous user is the referrer cascade with the user.
    await run(`delete from referrals where referee_user_id = $1
                 and (referrer_user_id = $2 or exists (select 1 from referrals where referee_user_id = $2))`);
    await run(
      "update referrals set referee_user_id = $2, updated_at = now() where referee_user_id = $1",
    );

    // Sessions first (explicit), then the user; everything left cascades.
    await client.query("delete from session where user_id = $1", [anonymousUserId]);
    await client.query(`delete from "user" where id = $1`, [anonymousUserId]);

    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
