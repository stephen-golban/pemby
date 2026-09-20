import { markApplied } from "../../_lib/db";
import { authorize, fail, isUuid, json } from "../../_lib/http";

export const dynamic = "force-dynamic";

/**
 * `POST /api/kit/:jobId/applied` — the person sent it themselves, and says so.
 *
 * The one action on the kit surface that changes anything outside the kit, and it changes only the
 * tracker: it writes the `applications` row the board reads and moves the match with it.
 * **It submits nothing anywhere** (PLAN D9, D16) — it is a record of something the person already
 * did in the employer's own form.
 *
 * **404 when Pemby never showed this person this post.** `markApplied` delegates that decision to
 * `recordApplicationState`, the tracker's own writer, so this surface permits exactly what the
 * board permits and not a row more; see the note on `markApplied` for what an unchecked insert here
 * was worth to an attacker. The same 404 answers "no such job", so a probe cannot tell a post it
 * may not write to from one that does not exist.
 *
 * Idempotent, and non-destructive: a second tap re-asserts the state the row already holds rather
 * than dragging an advanced application back to Applied.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> },
): Promise<Response> {
  const auth = await authorize(request);
  if (auth.error) return auth.error;

  const { jobId } = await params;
  if (!isUuid(jobId)) return fail("invalid_request");

  const result = await markApplied(auth.session.user.id, jobId);
  if (result === "not-yours") return fail("job_not_found");
  return json({ applied: true, recorded: result === "recorded" });
}
