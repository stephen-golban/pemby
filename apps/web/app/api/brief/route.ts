import { loadBrief } from "./_lib/db";
import { authorize, json } from "./_lib/http";
import type { BriefView } from "./_lib/view";

/**
 * `GET /api/brief` — everything the Brief page shows for the signed-in user (PLAN D6, D7):
 * the matches best score first, the near misses grouped by the one gate that blocked them, the
 * programs calendar's next real step, and the two settings the one-tap fixes flip.
 *
 * Never cached, like every route that answers with someone's own data.
 */
export async function GET(request: Request): Promise<Response> {
  const auth = await authorize(request);
  if (auth.error) return auth.error;
  const body: BriefView = await loadBrief(auth.session.user.id);
  return json(body);
}
