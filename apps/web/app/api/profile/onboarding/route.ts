import { completeOnboarding } from "../_lib/db";
import { authorize, fail, isAnonymous, json } from "../_lib/http";

/**
 * `POST /api/profile/onboarding` — the end of the three steps (PLAN D5). Stamps
 * `profiles.onboarding_completed_at` once and answers the profile as it now stands. Idempotent: a
 * second call keeps the first timestamp, so a double submit cannot move it.
 */
export async function POST(request: Request): Promise<Response> {
  const auth = await authorize(request);
  if (auth.error) return auth.error;

  let saved;
  try {
    saved = await completeOnboarding(auth.session.user.id, isAnonymous(auth.session));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "23503") saved = null;
    else throw error;
  }
  if (!saved) return fail("unauthenticated", 401);
  return json(saved);
}
