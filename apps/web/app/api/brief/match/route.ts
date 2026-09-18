import { setMatchState } from "../_lib/db";
import { authorize, fail, isIn, isUuid, json, readJson } from "../_lib/http";
import { MATCH_STATES, PASS_REASONS, type MatchStatePatch } from "../_lib/view";

type Parsed = { ok: true; patch: MatchStatePatch } | { ok: false };

/**
 * `passed` carries exactly one of the `match_pass_reason` values and every other state carries
 * none (PLAN D6: a one-tap reason picker, no free text). A body that mixes the two is refused
 * rather than silently trimmed, so a client bug cannot quietly drop the feedback that tunes
 * scoring.
 */
function parse(body: Record<string, unknown> | null): Parsed {
  if (!body) return { ok: false };
  if (!isUuid(body.matchId) || !isIn(MATCH_STATES, body.state)) return { ok: false };
  if (body.state === "passed") {
    if (!isIn(PASS_REASONS, body.passReason)) return { ok: false };
    return {
      ok: true,
      patch: { matchId: body.matchId, state: "passed", passReason: body.passReason },
    };
  }
  if (body.passReason !== undefined) return { ok: false };
  return { ok: true, patch: { matchId: body.matchId, state: body.state } };
}

/**
 * `PATCH /api/brief/match` — Apply, Save and "Not for me" (PLAN D6).
 *
 * Applying only records that the person applied; Pemby never applies on anyone's behalf, and the
 * client opens the post's own URL itself. "Not for me" also feeds `applyPassFeedback` into this
 * user's `scoring_nudges`, in the same transaction as the state change.
 */
export async function PATCH(request: Request): Promise<Response> {
  const auth = await authorize(request);
  if (auth.error) return auth.error;

  const parsed = parse(await readJson(request));
  if (!parsed.ok) return fail("invalid_request", 400);

  const moved = await setMatchState(
    auth.session.user.id,
    parsed.patch.matchId,
    parsed.patch.state,
    parsed.patch.passReason ?? null,
  );
  if (!moved) return fail("match_not_found", 404);
  return json({ matchId: parsed.patch.matchId, state: parsed.patch.state });
}
