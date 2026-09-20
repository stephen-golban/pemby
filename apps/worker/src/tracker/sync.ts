// Editing an already-sent Telegram match card when the tracker state changes on the web.
//
// **This ships unproven, and that is an accepted owner decision (contract, owner decision 3).** No
// match card has ever been delivered on staging — `matches` holds 208 rows and every one of them is
// a `near_miss`, and the three `delivery_log` rows are seeds carrying `provider_message_id` values
// like `demo-1`. So what can be shown is that the queue exists, the job runs, the query returns the
// right row and the sender is called with the right arguments. **That a real card actually edits is
// not proven and cannot be until a real card has been sent.**
//
// What the edit does: replaces the card's buttons with a link to the post and a link to the tracker
// labelled with the column the match is now in. The message *text* is left alone. The Bot API has no
// way to read a message the bot did not just receive, so re-rendering the text would mean rebuilding
// the card from scratch and hoping it matches what was sent — and getting it wrong rewrites a
// person's card with different words. `apps/bot/src/callbacks.ts` can append to the text because a
// callback hands it `message.text` and `message.entities`; nothing hands those to a queue handler.
import { renderDeliveryString, trackerColumnOf, TRACKER_COLUMN_LABELS } from "@pemby/core";
import type { TrackerColumn } from "@pemby/core";
import type { Db } from "@pemby/db";
import { sql } from "drizzle-orm";

export interface TrackerCardRow {
  /** Telegram chat id, from `channels.address`. */
  chatId: string;
  /** Telegram `message_id`, from `delivery_log.provider_message_id`. */
  messageId: string;
  /** The column the match is in now, or null when it does not belong on the board. */
  column: TrackerColumn | null;
  /** The public posting URL, for the card's one remaining action. */
  jobUrl: string;
}

type Raw = {
  chat_id: string;
  message_id: string;
  match_state: "new" | "saved" | "applied" | "passed" | null;
  application_state:
    | "applied"
    | "screening"
    | "interviewing"
    | "offer"
    | "rejected"
    | "withdrawn"
    | "no_response"
    | null;
  job_url: string;
};

/**
 * The sent Telegram card for one match, and the column that match is in now — or null when there is
 * nothing to edit.
 *
 * Null covers every honest "no": the match does not exist, it was never delivered on Telegram, the
 * send carried no `provider_message_id` (email and push never do), the channel has since been
 * deleted or marked dead, or the person is a demo profile.
 *
 * **The demo join is `profiles.is_demo = false`, not a per-table flag** — the phase-08 mitigation,
 * because `is_demo` exists on exactly three tables and the seed writes rows into `delivery_log` like
 * everything else. Without it the three seeded rows would hand Telegram `demo-1` as a message id
 * three times a deploy, collect a 400 each, retry, and leave failures in `pgboss.job` that look like
 * a broken integration.
 *
 * `status = 'sent'` and not `<> 'failed'`: a `claimed` row means a send is in flight and its message
 * id is not written yet. Editing is only possible once there is something to edit.
 *
 * The state is read **here, at run time**, and never carried in the queue payload — which is what
 * makes the queue's `exclusive` collapsing of rapid state changes safe: whichever job survives reads
 * the final state.
 */
export async function loadTrackerCard(db: Db, matchId: string): Promise<TrackerCardRow | null> {
  const rows = await db.execute<Raw>(sql`
    select ch.address           as chat_id,
           dl.provider_message_id as message_id,
           m.state::text        as match_state,
           a.state::text        as application_state,
           j.url                as job_url
      from matches m
      join jobs j       on j.id = m.job_id
      join delivery_log dl on dl.match_id = m.id
                          and dl.channel_type = 'telegram'
                          and dl.status = 'sent'
                          and dl.provider_message_id is not null
      join channels ch  on ch.id = dl.channel_id
                       and ch.type = 'telegram'
                       and ch.dead_at is null
      join profiles p   on p.user_id = m.user_id and p.is_demo = false
      left join applications a on a.user_id = m.user_id and a.job_id = m.job_id
     where m.id = ${matchId}::uuid
     order by dl.sent_at desc nulls last
     limit 1
  `);
  const r = rows.rows[0];
  if (!r) return null;
  return {
    chatId: r.chat_id,
    messageId: r.message_id,
    // One mapping, shared with the web tracker. A second `switch` here is how the column a person
    // sees on Telegram and the column they see on the web come to disagree.
    column: trackerColumnOf({
      matchState: r.match_state,
      applicationState: r.application_state,
    }),
    jobUrl: r.job_url,
  };
}

export interface TrackerButton {
  label: string;
  url: string;
}

/**
 * The card's new buttons: the post, and — when the match is on the board — the tracker, labelled
 * with its column.
 *
 * **Both halves of the label come from `@pemby/core`'s watched string table**, and neither is
 * composed here. `TRACKER_COLUMN_LABELS` is the same table `check:reasons` compares against the web
 * catalogue, so the Telegram button and the web column cannot be worded differently; and
 * `"button-tracker"` is the whole label with `{column}` as a parameter, rather than a suffix this
 * file concatenates. The parameterised form is the point: a call site that writes
 * `` `${label} — open tracker` `` hard-codes English word order and an em dash, and Russian is next
 * (PLAN D22). A suffix-only key would have moved the literal into the table without making it
 * translatable.
 *
 * A match that maps to **no** column (passed, or new and untouched) keeps only the post link. It is
 * not on the board, and a button saying otherwise would be a lie about where to find it.
 */
export function trackerCardButtons(
  card: Pick<TrackerCardRow, "column" | "jobUrl">,
  appUrl: string,
): TrackerButton[][] {
  const rows: TrackerButton[][] = [
    [{ label: renderDeliveryString("button-apply"), url: card.jobUrl }],
  ];
  if (card.column !== null && appUrl !== "") {
    rows.push([
      {
        label: renderDeliveryString("button-tracker", {
          column: TRACKER_COLUMN_LABELS[card.column],
        }),
        url: `${appUrl}/tracker`,
      },
    ]);
  }
  return rows;
}
