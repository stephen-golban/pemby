import { enqueueProfileMatch } from "@/lib/queue/match";
import { patchPreferences } from "../_lib/db";
import { authorize, fail, json, readJson } from "../_lib/http";
import { MIN_SCORE_FLOOR, type PreferencesPatch } from "../_lib/view";

type Parsed = { ok: true; patch: PreferencesPatch } | { ok: false };

function parse(body: Record<string, unknown> | null): Parsed {
  if (!body) return { ok: false };
  const patch: PreferencesPatch = {};
  for (const key of ["includeYellow", "hideNoSalary"] as const) {
    const value = body[key];
    if (value === undefined) continue;
    if (typeof value !== "boolean") return { ok: false };
    patch[key] = value;
  }

  // The score bar. Absent leaves it alone; `null` hands it back to the configured threshold; a
  // number is accepted only inside the band.
  //
  // **The floor is enforced here, not in the client**, and it is not a formality: a bar below the
  // near-miss band's own floor asks for rows the matcher never wrote, so the tap would widen
  // nothing while telling the person it had. The ceiling is 100 because the column is a smallint
  // and a bar above the top of the scale silently empties the Brief.
  if ("scoreFloor" in body) {
    const value = body.scoreFloor;
    if (value !== null) {
      if (typeof value !== "number" || !Number.isInteger(value)) return { ok: false };
      if (value < MIN_SCORE_FLOOR || value > 100) return { ok: false };
    }
    patch.scoreFloor = value;
  }

  return Object.keys(patch).length > 0 ? { ok: true, patch } : { ok: false };
}

/**
 * `PATCH /api/brief/preferences` — the three one-tap fixes a near-miss group offers: include the
 * likely (yellow) posts (PLAN D7), show the posts that list no pay (D7), and lower your own score
 * bar (owner decision 2026-09-19, amending D6).
 *
 * `include_yellow` has its own route rather than going through `/api/profile` because it is not
 * one of that route's writable keys, and because all three fixes belong to this screen. No pass
 * check on any of them: the yellow opt-in moved to the free tier when D13 was amended on
 * 2026-09-17, and the score bar narrows or widens one person's own page.
 */
export async function PATCH(request: Request): Promise<Response> {
  const auth = await authorize(request);
  if (auth.error) return auth.error;

  const parsed = parse(await readJson(request));
  if (!parsed.ok) return fail("invalid_request", 400);

  const saved = await patchPreferences(auth.session.user.id, parsed.patch);
  if (!saved) return fail("unauthenticated", 401);

  // This is the whole mechanism, not a refinement of it. `include_yellow` decides the user's
  // `allowedTiers` in `entitlementsFor`, and `hide_no_salary` is read by the salary gate — both are
  // re-read from the profile row on the next run, so without this send the row changes, the
  // verdicts do not, and the screen's promise that "they join your Brief at the next check" names a
  // check that never happens.
  //
  // `score_floor` is the exception, and is sent anyway rather than branched on: the Brief read
  // re-applies that bar itself (`_lib/db.ts`, `ownBar`), so those rows are already on the page
  // before any run — which is why the score fix's copy says they are here rather than coming.
  await enqueueProfileMatch(auth.session.user.id, "preferences-patch");
  return json(saved);
}
