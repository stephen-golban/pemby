// The wire shape of `/api/applications`, shared by the route handlers and the client.
//
// **The view carries facts, not columns.** `selectTracker` deliberately does not pre-map a row to a
// board column and neither does this file: every row travels with its `matchState` and its
// `applicationState`, and both ends call `trackerColumnOf` from `@pemby/core` to decide where it
// sits. That is the owner's decision ("the mapping is one pure function and both surfaces call
// it"), and it buys the optimistic UI for free — the client changes one field, re-runs the same
// function the server would have run, and the row moves column in the same frame.

import type { JobStatus } from "@pemby/db";
import type { TrackerApplicationState, TrackerMatchState } from "@pemby/core";

/** The application states the row picker offers, in the order it offers them. */
export const APPLICATION_STATES = [
  "applied",
  "screening",
  "interviewing",
  "offer",
  "rejected",
  "withdrawn",
  "no_response",
] as const satisfies readonly TrackerApplicationState[];

export interface TrackerRowView {
  jobId: string;
  /** Null when the application outlived its match row. `tracker.sync` needs it to edit a card. */
  matchId: string | null;
  title: string;
  companyName: string;
  /** The post. `applyUrl` is the employer's own form when the post names a different one. */
  url: string;
  applyUrl: string | null;
  /** Carried so the board can say a post has closed rather than lying by omission. */
  jobStatus: JobStatus;
  /**
   * A seeded, fictional job. The row carries an EXAMPLE stamp, as every demonstration in this
   * product does (DESIGN.md): a fictional employer must never read as a real application.
   *
   * Read separately rather than taken from `selectTracker`, which returns no `is_demo` — see the
   * note on `loadTracker`.
   */
  demo: boolean;
  matchState: TrackerMatchState | null;
  applicationState: TrackerApplicationState | null;
  /** True once the person has answered "yes" to "rejected because of my location?". */
  rejectedForLocation: boolean;
  /** ISO, or null while there is no application row. */
  appliedAt: string | null;
  updatedAt: string;
}

export interface TrackerView {
  /** Stamped by the server, so first paint and hydration agree on every "3 days ago". */
  readAt: string;
  /**
   * The person's residence country, or null when their profile records none.
   *
   * The board needs it for exactly one thing: a location rejection is filed as evidence **scoped to
   * a country**, so with no country there is no scope and the question is worth asking differently
   * rather than asking and dropping the answer.
   */
  country: string | null;
  rows: TrackerRowView[];
}

/** `PATCH /api/applications`. */
export interface StatePatch {
  jobId: string;
  state: TrackerApplicationState;
}

/** `POST /api/applications/location`. One-way: see the note on `reportLocationRejection`. */
export interface LocationReport {
  jobId: string;
}
