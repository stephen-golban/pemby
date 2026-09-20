import { loadAdminView } from "./_lib/db";
import { authorizeOwner, json } from "./_lib/http";
import type { AdminView } from "./_lib/view";

/**
 * `GET /api/admin` — the five panels of the owner's admin page: flags waiting on a decision,
 * quarantined jobs, today's AI spend against the real cap, board health, and failed deliveries.
 *
 * Owner only, unconditionally (`authorizeOwner`). Never cached.
 */
export async function GET(request: Request): Promise<Response> {
  const auth = await authorizeOwner(request);
  if (auth.error) return auth.error;
  const body: AdminView = await loadAdminView();
  return json(body);
}
