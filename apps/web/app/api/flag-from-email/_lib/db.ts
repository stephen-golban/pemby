// The one read this route needs that `app/api/brief/_lib/db.ts` does not already have. Raw SQL on
// the shared pool for the reason the header of that file gives.

import { getDb } from "@pemby/db";

/**
 * The job a match is about, if that match belongs to this user.
 *
 * The token already binds the match id to the user id under a signature, so this is the second
 * check rather than the first — and it is worth having, because it is the one that keeps working
 * if the signing key ever leaks or a future caller passes a match id from somewhere else. It also
 * closes the window that matters most here: `flags` is keyed on the *job*, so a route that took a
 * job id straight from a link would let anyone who could mint a token flag any post in the
 * database. The job is derived, never supplied.
 *
 * Null when the match does not exist or is not theirs — the same answer for both, deliberately.
 */
export async function loadMatchJobId(matchId: string, userId: string): Promise<string | null> {
  const { rows } = await getDb().$client.query<{ job_id: string }>(
    "select job_id from matches where id = $1 and user_id = $2",
    [matchId, userId],
  );
  return rows[0]?.job_id ?? null;
}
