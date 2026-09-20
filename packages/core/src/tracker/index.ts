// The application tracker's one mapping (owner decision, 2026-09-19).
//
// Two surfaces render the same board: the web tracker (`apps/web/app/tracker`) and the Telegram
// card the worker edits when a state changes (`tracker.sync`). Both call `trackerColumnOf` and
// neither writes its own `switch`. A second mapping is how the two ends drift, and drift here is
// not cosmetic: the column a user sees on Telegram and the column they see on the web would
// disagree about whether they have an interview.
//
// The decision, which is settled:
//
//   saved      <- matches.state = 'saved', and no applications row exists
//   applied    <- applications.state = 'applied'
//   interview  <- applications.state = 'screening' OR 'interviewing'
//   offer      <- applications.state = 'offer'
//   rejected   <- applications.state = 'rejected'
//   withdrawn / no_response  -> reachable secondary states, deliberately NOT columns
//
// No enum value is added and no migration touches `application_state`. `interview` folds two enum
// values into one column because the difference between a screening call and an onsite is not a
// difference the board is for.
//
// Pure and isomorphic, like the rest of core: no DB types, no React, no `node:` imports. The two
// state lists below are declared here rather than imported from `@pemby/db`, because core must not
// depend on the database package — see the agreement note on each.

import { TRACKER_COLUMN_LABELS } from "../delivery/strings/en";

/**
 * The board's columns, in render order.
 *
 * Left to right is the direction an application actually travels, and `rejected` sits at the end
 * rather than being hidden: a tracker that only shows progress is a tracker people stop trusting.
 */
export const TRACKER_COLUMNS = ["saved", "applied", "interview", "offer", "rejected"] as const;
export type TrackerColumn = (typeof TRACKER_COLUMNS)[number];

/**
 * `matches.state` (`packages/db/src/schema/enums.ts`, pg enum `match_state`).
 *
 * **Must agree with that enum.** Declared here because `@pemby/core` cannot import `@pemby/db`;
 * an added value there that is missing here is a compile error at every exhaustive `switch` that
 * consumes this type, which is the failure mode we want.
 */
export const TRACKER_MATCH_STATES = ["new", "saved", "applied", "passed"] as const;
export type TrackerMatchState = (typeof TRACKER_MATCH_STATES)[number];

/**
 * `applications.state` (pg enum `application_state`). Same agreement note as above: this list and
 * the enum are the same list, kept in two places because of a package boundary.
 *
 * `withdrawn` and `no_response` are members here and are not columns. They stay reachable as
 * secondary states — a row in one of them maps to `null` and the board does not show it.
 */
export const TRACKER_APPLICATION_STATES = [
  "applied",
  "screening",
  "interviewing",
  "offer",
  "rejected",
  "withdrawn",
  "no_response",
] as const;
export type TrackerApplicationState = (typeof TRACKER_APPLICATION_STATES)[number];

export interface TrackerColumnInput {
  /** `matches.state`, or null when the row has no match (a job the user added themselves). */
  matchState: TrackerMatchState | null;
  /** `applications.state`, or null when no `applications` row exists for this (user, job). */
  applicationState: TrackerApplicationState | null;
}

/**
 * The column this (match, application) pair belongs in, or `null` for "not on the board".
 *
 * `null` is a real answer and the caller must render nothing for it: a passed match, a new
 * undelivered match, a withdrawn application and a no-response application are all rows that exist
 * and do not belong in a column.
 *
 * **The application row wins whenever there is one**, so someone with an offer is never dragged
 * back to `applied` by a stale `matches.state`.
 *
 * **When there is none, `matches.state` still answers for `saved` and `applied`.** As of phase 09
 * nothing writes `applications` at all: the two "I applied" writers — `setMatchState` in
 * `apps/web/app/api/brief/_lib/db.ts` and the bot's in `apps/bot/src/store-db.ts`, which
 * `apps/bot/src/callbacks.ts` maps the Telegram button to — update `matches` and the scoring
 * nudges and nothing else. So `{ matchState: "applied", applicationState: null }` is not a
 * hypothetical: it is what **every** applied job looks like today, and mapping it to `null` made
 * the tracker fetch those rows and throw them away. A job someone has marked applied is an applied
 * job whether or not a second table has caught up.
 */
export function trackerColumnOf(input: TrackerColumnInput): TrackerColumn | null {
  if (input.applicationState !== null) {
    switch (input.applicationState) {
      case "applied":
        return "applied";
      case "screening":
      case "interviewing":
        return "interview";
      case "offer":
        return "offer";
      case "rejected":
        return "rejected";
      case "withdrawn":
      case "no_response":
        return null;
    }
  }
  switch (input.matchState) {
    case "saved":
      return "saved";
    case "applied":
      return "applied";
    // `new` is delivered-but-untouched and `passed` is "not for me": neither is on the board.
    case "new":
    case "passed":
    case null:
      return null;
  }
}

/**
 * Column headings.
 *
 * The strings themselves live in `../delivery/strings/en.ts`, the table
 * `packages/core/scripts/check-reasons.ts` watches, and are re-exported from here so a caller
 * imports the labels from the same module as the mapping. Copying the strings into this file
 * instead would take them out of the checker's sight, which is precisely how phase 08 shipped two
 * copies of the same sentence that disagreed.
 */
export { TRACKER_COLUMN_LABELS };
