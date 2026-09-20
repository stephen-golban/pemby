import { loadTracker, recordApplicationState } from "./_lib/db";
import { enqueueTrackerSync } from "./_lib/sync";
import { authorize, fail, isIn, isUuid, json, readJson } from "./_lib/http";
import { APPLICATION_STATES, type StatePatch } from "./_lib/view";

type Parsed = { ok: true; patch: StatePatch } | { ok: false };

function parse(body: Record<string, unknown> | null): Parsed {
  if (!body) return { ok: false };
  if (!isUuid(body.jobId) || !isIn(APPLICATION_STATES, body.state)) return { ok: false };
  return { ok: true, patch: { jobId: body.jobId, state: body.state } };
}

/** `GET /api/applications` — the board, as facts. The column is `trackerColumnOf`'s to decide. */
export async function GET(request: Request): Promise<Response> {
  const auth = await authorize(request);
  if (auth.error) return auth.error;
  return json(await loadTracker(auth.session.user.id));
}

/**
 * `PATCH /api/applications` — move one job to an application state (PLAN D9).
 *
 * The body carries an `application_state`, not a board column, because `interview` folds two enum
 * values and a route that took the column would have to invent which of them the person meant. The
 * board summarises; the picker is precise.
 *
 * Nothing here applies to anything. Pemby records what the person did and never submits anything
 * anywhere (PLAN D9); the row is their own note about their own application.
 */
export async function PATCH(request: Request): Promise<Response> {
  const auth = await authorize(request);
  if (auth.error) return auth.error;

  const parsed = parse(await readJson(request));
  if (!parsed.ok) return fail("invalid_request", 400);

  const written = await recordApplicationState(
    auth.session.user.id,
    parsed.patch.jobId,
    parsed.patch.state,
  );
  if (!written) return fail("job_not_found", 404);

  // After the write, and never in front of it: the card follows the row, and a queue that is
  // unreachable must not turn a saved change into an error.
  if (written.matchId !== null) await enqueueTrackerSync(written.matchId);

  return json({ jobId: parsed.patch.jobId, state: parsed.patch.state });
}
