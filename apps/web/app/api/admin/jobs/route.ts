import { releaseQuarantinedJob } from "../_lib/db";
import { authorizeOwner, fail, isIn, isUuid, json, readJson, statusFor } from "../_lib/http";
import { ADMIN_JOB_ACTIONS } from "../_lib/view";

/**
 * `POST /api/admin/jobs` — put a quarantined post back in front of every user it matches.
 *
 * `{ jobId, action: "release" }`. Its own route rather than another verb on `/api/admin/flags`,
 * because it is not a judgement about a flag: a post can be in quarantine with no flag worth
 * deciding, and deciding a flag does not have to move a post. Folding them together would make one
 * of those two impossible to express.
 *
 * Owner only, unconditionally. 409 `job_not_quarantined` when the post is not held — which is also
 * the answer for a job id that is not in the quarantined list at all, so the route never confirms
 * whether an arbitrary id exists. 503 `release_unavailable` while `releaseJob` is missing from the
 * kernel; the panel does not draw the control while that is true, so this is the answer to a
 * request that did not come from the page.
 */
export async function POST(request: Request): Promise<Response> {
  const auth = await authorizeOwner(request);
  if (auth.error) return auth.error;

  const body = await readJson(request);
  const jobId = body?.jobId;
  const action = body?.action;
  if (!isUuid(jobId) || !isIn(ADMIN_JOB_ACTIONS, action)) {
    return fail("invalid_request", 400);
  }

  const result = await releaseQuarantinedJob(jobId);
  if (!result.ok) return fail(result.reason, statusFor(result.reason));
  return json({ released: result.released });
}
