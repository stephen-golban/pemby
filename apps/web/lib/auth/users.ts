import { getDb } from "@pemby/db";

// Raw SQL on the shared pool, for the same reason as claim.ts (apps/web cannot import the
// drizzle-orm copy that @pemby/db's schema types against).

/**
 * Deletes the unverified account that holds `email`, so a later sign-up can take the address with
 * its own password.
 *
 * Without this, anyone can sign up with someone else's address: the real owner receives a genuine
 * verification email, verifying it hands them an account whose password the stranger knows, and
 * their own sign-up can never replace it (a duplicate sign-up only gets the anti-enumeration
 * response). Only accounts that were never verified can be taken over this way, and nobody can
 * hold data in one: signing in needs a verified email, and a pending claim is settled only after
 * verification.
 *
 * Returns:
 * - `deleted` — the unverified account is gone (sessions, credentials and its pending claim
 *   cascade); the caller may create the new user.
 * - `kept` — nothing to delete, or the row must not be removed: a verified account, an anonymous
 *   user, or (defensively) an unverified account that does own CV files. The sign-up then follows
 *   Better Auth's normal duplicate path.
 */
export async function replaceUnverifiedUser(email: string): Promise<"deleted" | "kept"> {
  const result = await getDb().$client.query(
    `delete from "user" u
      where lower(u.email) = lower($1)
        and not u.email_verified
        and not u.is_anonymous
        and not exists (select 1 from cv_files c where c.user_id = u.id)
      returning u.id`,
    [email],
  );
  return (result.rowCount ?? 0) > 0 ? "deleted" : "kept";
}

/**
 * The session token this request presents, or null. The cookie value is `<token>.<signature>`, and
 * the name carries the `__Secure-` prefix on https.
 */
function presentedSessionToken(request: Request | undefined): string | null {
  const header = request?.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    const name = part.slice(0, separator).trim();
    if (!name.endsWith("better-auth.session_token")) continue;
    const value = decodeURIComponent(part.slice(separator + 1).trim());
    const token = value.split(".")[0];
    if (token) return token;
  }
  return null;
}

/**
 * Ends the user's sessions when their email is verified, so that any session opened before the
 * address was proven — for instance by whoever created the account with someone else's address —
 * is gone before the verified user's own session is created.
 *
 * The session presented by the request being served is spared. It can only be this same user's
 * session (the filter is on `user_id`), so nothing an attacker holds survives; without this, the
 * person verifying while already signed in would have their cookie cleared by Better Auth's later
 * lookup of a session row that no longer exists.
 */
export async function revokeSessionsBeforeVerification(
  userId: string,
  request?: Request,
): Promise<void> {
  const keep = presentedSessionToken(request);
  await getDb().$client.query(
    `delete from session where user_id = $1 and ($2::text is null or token <> $2)`,
    [userId, keep],
  );
}

/**
 * True when an anonymous user's data is recent enough to belong to the person signing in now.
 *
 * Signing in from an anonymous session moves that session's data into the account. On a shared
 * computer the anonymous session can be someone else's: they drop a CV, leave, and the next person
 * signs in. Anonymous data older than `maxAgeMinutes` is therefore left alone and expires with the
 * anonymous user. Age is the newest CV file, or the anonymous user's own creation time when there
 * is none.
 */
export async function anonymousDataIsRecent(
  anonymousUserId: string,
  maxAgeMinutes: number,
): Promise<boolean> {
  const result = await getDb().$client.query<{ recent: boolean }>(
    `select coalesce(
              (select max(c.created_at) from cv_files c where c.user_id = u.id),
              u.created_at
            ) > now() - make_interval(mins => $2::int) as recent
       from "user" u where u.id = $1`,
    [anonymousUserId, maxAgeMinutes],
  );
  return result.rows[0]?.recent === true;
}
