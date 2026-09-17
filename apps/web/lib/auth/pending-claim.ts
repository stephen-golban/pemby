import { getDb } from "@pemby/db";
import { claimAnonymousUser } from "./claim";
import { PENDING_CLAIM_MAX_AGE_HOURS } from "./codes";

// Claim on verification (phase 06 contract, flow step 8). With email verification required,
// sign-up sets no session cookie, so Better Auth's anonymous `onLinkAccount` never runs for it, and
// the verification link may be opened on another device that has no anonymous cookie at all. The
// link between the two users is therefore stored at sign-up and settled once the email is verified.
// Raw SQL on the shared pool for the same reason as claim.ts.

/**
 * Records that `newUserId` was created from `anonymousUserId`'s session. One pending claim per
 * anonymous user: signing up again from the same session (a mistyped email) replaces the target.
 */
export async function recordPendingClaim(anonymousUserId: string, newUserId: string) {
  if (anonymousUserId === newUserId) return;
  await getDb().$client.query(
    `insert into pending_claims (anonymous_user_id, new_user_id)
     select $1, $2 where exists (select 1 from "user" where id = $1 and is_anonymous)
     on conflict (anonymous_user_id)
     do update set new_user_id = excluded.new_user_id, created_at = now()`,
    [anonymousUserId, newUserId],
  );
}

/**
 * Runs the pending claim whose target is `userId`, if there is one, that user's email is verified
 * and the claim is younger than `PENDING_CLAIM_MAX_AGE_HOURS` (an anonymous session's data belongs
 * to whoever signed up from it minutes ago, not to an account verified days later). Safe to call repeatedly and concurrently: `claimAnonymousUser` locks the anonymous user
 * and returns without changes once it is gone, and deleting the anonymous user cascades to its
 * pending row. If the anonymous user was already cleaned up (24 h expiry), the row cascaded away
 * with it and nothing is claimed.
 *
 * Residual risk: someone who signs up with another person's address from their own anonymous
 * session can still push that session's data into the account if the address's owner verifies that
 * sign-up within the window above. `replaceUnverifiedUser` (users.ts) closes the useful half of
 * it: the owner's own sign-up deletes the unverified account, its pending claim with it.
 */
export async function settlePendingClaim(userId: string): Promise<"claimed" | "none"> {
  const pool = getDb().$client;
  const found = await pool.query<{ anonymous_user_id: string }>(
    `select p.anonymous_user_id
       from pending_claims p join "user" u on u.id = p.new_user_id
      where p.new_user_id = $1 and u.email_verified and not u.is_anonymous
        and p.created_at > now() - make_interval(hours => $2::int)`,
    [userId, PENDING_CLAIM_MAX_AGE_HOURS],
  );
  const anonymousUserId = found.rows[0]?.anonymous_user_id;
  if (!anonymousUserId) return "none";
  await claimAnonymousUser(anonymousUserId, userId);
  // Normally already gone through the cascade; covers an anonymous user that stopped being claimable.
  await pool.query("delete from pending_claims where new_user_id = $1", [userId]);
  return "claimed";
}
