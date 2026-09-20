import { reportLocationRejection } from "../_lib/db";
import { authorize, fail, isUuid, json, readJson } from "../_lib/http";

/**
 * `POST /api/applications/location` — "Rejected because of my location?", answered yes.
 *
 * This is the one place in the product where a rejection becomes evidence. It writes
 * `applications.rejected_for_location` and, for a person whose profile records a country, one
 * `eligibility_evidence` row scoped to that country against the company — the same channel a flag
 * uses, at a deliberately smaller weight (see `_lib/db.ts`). The eligibility engine reads it at the
 * company's next check, so what the person answers here is what future Briefs know.
 *
 * Idempotent and one-way. Answering twice writes once; there is no un-report, because the evidence
 * row carries no user id and no row can be traced back to the person who wrote it.
 */
export async function POST(request: Request): Promise<Response> {
  const auth = await authorize(request);
  if (auth.error) return auth.error;

  const body = await readJson(request);
  if (!body || !isUuid(body.jobId)) return fail("invalid_request", 400);

  const reported = await reportLocationRejection(auth.session.user.id, body.jobId);
  if (!reported) return fail("job_not_found", 404);
  // No application row, or the row is not rejected: the question does not apply to it, and saying
  // so is better than a 200 that records nothing. A row that was already reported is not this case
  // — it is a success, and `recorded` is false only because there was nothing left to write.
  if (!reported.eligible) return fail("not_applied", 409);

  return json({ jobId: body.jobId, rejectedForLocation: true });
}
