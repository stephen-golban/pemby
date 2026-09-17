import { getSession } from "@/lib/auth/session";
import { appEnv } from "@/lib/env";
import { getTeaserSource, loadTeaserInput } from "@/lib/teaser";
import { parseTeaserQuery } from "@/lib/teaser/query";

const NO_STORE = { "Cache-Control": "no-store" };

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: NO_STORE });

/**
 * GET /api/teaser (phase 06 contract, flow step 7). Any session, anonymous included. Defaults come
 * from the user's profile, then their latest parsed CV; `country`, `ways`, `seniority` and `titles`
 * override them. The response holds public job data and the country, nothing else about the user.
 */
export async function GET(request: Request): Promise<Response> {
  if (process.env.CV_DROP_ENABLED !== "true" || appEnv() === "production") {
    return json({ error: "not_found" }, 404);
  }

  const session = await getSession(request.headers);
  if (!session) return json({ error: "unauthenticated" }, 401);

  const query = parseTeaserQuery(new URL(request.url).searchParams);
  if (!query.ok) return json({ error: "invalid_teaser_query" }, 400);

  const defaults = await loadTeaserInput(session.user.id);
  const result = await getTeaserSource().teaser({ ...defaults, ...query.overrides });
  return json(result);
}
