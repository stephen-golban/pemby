// The one place apps/web asks for a Brief to be rebuilt.
//
// `match.profile` is the queue that re-scores one person against the open jobs. Nothing in the
// product used to enqueue it, so a finished onboarding produced no Brief, an edited profile kept
// the old one, and the two one-tap fixes on the Brief ("include the likely matches", "show the
// posts that list no pay") wrote a preference and changed nothing — while the screen promised the
// person their Brief would pick it up at the next check. Every route that can change what the
// matcher would decide calls `enqueueProfileMatch` now.
//
// **Never fails the caller's write.** The user's row is already saved by the time this runs; a
// queue that is briefly unreachable is not a reason to hand them an error for a change that
// landed, and `embed.profile` or the next `match.sweep` will produce the same Brief a little
// later. The cost of a lost enqueue is a late Brief, the cost of a thrown one is a false failure.
// This mirrors `markEnqueueFailed` in `app/api/cv/route.ts`: the enqueue is wrapped, and what the
// caller sees does not depend on it.
//
// **Privacy**: the payload is a profile id and the log lines carry ids and an error *name* only —
// never a profile field, and never the reason text of a database error, whose message quotes its
// parameters.
import { getDb } from "@pemby/db";

import { MATCH_PROFILE_QUEUE, sendJob } from "./index";

/** Why the re-match was asked for. Logged as-is, so these are fixed labels, never user input. */
export type MatchTrigger = "profile-patch" | "preferences-patch" | "onboarding";

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : "error";
}

/**
 * Asks for one person's Brief to be rebuilt. Resolves and returns nothing; never throws.
 *
 * `singletonKey` is the profile id, and `match.profile` is a `short` queue — unique on that key
 * while the job is still `created`. So a burst of edits (a person moving through the profile page
 * field by field, or double-tapping a one-tap fix) collapses into one run, and because the drop
 * only happens while the job is waiting, an edit made *during* a run still schedules a fresh one:
 * the last thing the person changed is always what gets matched.
 *
 * Takes the user id rather than the profile id because that is what a session carries; the profile
 * row is looked up here so no route has to learn the queue's payload shape. A user with no profile
 * row yet has nothing to match and is a no-op.
 */
export async function enqueueProfileMatch(userId: string, trigger: MatchTrigger): Promise<void> {
  let profileId: string | undefined;
  try {
    const { rows } = await getDb().$client.query<{ id: string }>(
      `select id from profiles where user_id = $1`,
      [userId],
    );
    profileId = rows[0]?.id;
  } catch (error) {
    console.error(
      `match.profile: profile lookup failed trigger=${trigger} err=${errorName(error)}`,
    );
    return;
  }
  if (!profileId) return;

  try {
    // null means the queue already holds a waiting request for this profile; that is the
    // de-duplication working, not a failure.
    await sendJob(MATCH_PROFILE_QUEUE, { profileId }, { singletonKey: profileId });
  } catch (error) {
    console.error(
      `match.profile: enqueue failed profile=${profileId} trigger=${trigger} err=${errorName(error)}`,
    );
  }
}
