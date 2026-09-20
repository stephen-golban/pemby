// The web's one sender of `tracker.sync`.
//
// Telegram → web needs nothing: the bot writes the same database, so a card tapped in a chat is
// already on the board. This is the other direction — a state changed on the board has to reach the
// card the worker already sent, or the two ends disagree about whether a job was applied to.
//
// **Never fails the caller's write**, for the same reason `enqueueProfileMatch` does not
// (`lib/queue/match.ts`): the application row is saved by the time this runs, and a queue that is
// unreachable is not a reason to show someone an error for a change that landed. The cost of a lost
// enqueue is a Telegram card that still shows its old buttons; the cost of a thrown one is a false
// failure on a write that succeeded.
//
// **The queue may not exist yet, and that is the designed state while phase 09 is in flight.** The
// worker creates every queue at boot and the web client runs `createSchema: false`; until the
// worker's tracker module is registered, `boss.send` finds no queue and this is a no-op. Nothing
// about it is worth failing a request over.
//
// **Privacy:** the payload is one match id and the log line carries an error *name* only — never a
// job title, a company or the message of a database error, whose text quotes its parameters.

import { TRACKER_SYNC_QUEUE, sendJob } from "@/lib/queue";
import type { TrackerSyncData } from "@/lib/queue";

/**
 * Ask the worker to bring this match's already-sent Telegram card up to date. Never throws.
 *
 * `singletonKey` is the match id, so a person stepping a row through applied → interview → offer in
 * one sitting collapses into one edit per waiting job rather than three. The card is re-rendered
 * from the row as it stands when the job runs, so collapsing loses nothing.
 */
export async function enqueueTrackerSync(matchId: string): Promise<void> {
  try {
    await sendJob(TRACKER_SYNC_QUEUE, { matchId } satisfies TrackerSyncData, {
      singletonKey: matchId,
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : "error";
    console.error(`tracker.sync: enqueue failed match=${matchId} err=${name}`);
  }
}
