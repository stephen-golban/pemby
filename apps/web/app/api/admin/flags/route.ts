import { actionFlag } from "../_lib/db";
import { authorizeOwner, fail, isIn, isUuid, json, readJson, statusFor } from "../_lib/http";
import { ADMIN_FLAG_ACTIONS } from "../_lib/view";

/**
 * `POST /api/admin/flags` — the owner's verdict on one flag.
 *
 * `{ flagId, action: "approve" | "dismiss", release?: boolean }`. `approve` quarantines the post and
 * records the verdict; `dismiss` records a dismissal, which withdraws the evidence that flag
 * produced, and with `release: true` also takes the post out of quarantine. Both verdicts go through
 * `recordFlagOutcome` with `by: "owner"`, the same helper the worker's rules use; this surface adds
 * no second writer. The post is read from the flag's own row, never taken from the body.
 *
 * Owner only, unconditionally. 409 `flag_not_open` when somebody got to the flag first or the
 * transition is not one the kernel allows the owner; 409 `job_not_quarantined` when a release was
 * asked for on a post that is not held; 503 `release_unavailable` while `releaseJob` is missing from
 * the kernel.
 */
export async function POST(request: Request): Promise<Response> {
  const auth = await authorizeOwner(request);
  if (auth.error) return auth.error;

  const body = await readJson(request);
  const flagId = body?.flagId;
  const action = body?.action;
  const release = body?.release;
  if (
    !isUuid(flagId) ||
    !isIn(ADMIN_FLAG_ACTIONS, action) ||
    (release !== undefined && typeof release !== "boolean")
  ) {
    return fail("invalid_request", 400);
  }

  const result = await actionFlag(flagId, action, release === true);
  if (!result.ok) return fail(result.reason, statusFor(result.reason));
  return json({ actioned: true, quarantined: result.quarantined, released: result.released });
}
