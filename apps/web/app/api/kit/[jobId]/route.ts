import { loadKitPage } from "../_lib/generate";
import { authorize, fail, isUuid, json } from "../_lib/http";

/** Personal data on every path; nothing here is static. */
export const dynamic = "force-dynamic";

/**
 * `GET /api/kit/:jobId` — the kit surface's state: the post, the kit if one has been written, the
 * quota, and the application defaults.
 *
 * The page reads this on the server for its first paint and the client re-reads it afterwards, so
 * a kit generated in one tab settles in another. It never returns a kit that is not the caller's:
 * `selectKit` has `user_id` inside its predicate rather than checking it afterwards.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> },
): Promise<Response> {
  const auth = await authorize(request);
  if (auth.error) return auth.error;

  const { jobId } = await params;
  if (!isUuid(jobId)) return fail("invalid_request");

  const page = await loadKitPage(auth.session.user.id, jobId, new Date());
  if (!page) return fail("job_not_found");
  return json(page);
}
