import { appEnv } from "@/lib/env";
import { loadProfileView, patchProfile } from "./_lib/db";
import { authorize, fail, isAnonymous, json } from "./_lib/http";
import { parseProfilePatch } from "./_lib/validate";
import type { ProfileView } from "./_lib/view";

/**
 * The user's own profile (PLAN D5), read and written by `/onboarding` and `/profile`.
 *
 * `GET` answers the whole `ProfileView`; `PATCH` takes any subset of its writable keys and answers
 * the profile as it now stands, so an optimistic client can reconcile in one round trip. The body
 * still carries `displayName`, which is what `components/display-name-form.tsx` on `/app` reads and
 * writes, so that reference example keeps working unchanged.
 */

export async function GET(request: Request): Promise<Response> {
  const auth = await authorize(request);
  if (auth.error) return auth.error;
  const body: ProfileView = await loadProfileView(auth.session.user.id, isAnonymous(auth.session));
  return json(body);
}

/** Outside production, saving this value fails on purpose so the rollback can be watched. */
const FORCED_FAILURE = "fail";

function forcesFailure(patch: Record<string, unknown>): boolean {
  if (appEnv() === "production") return false;
  return Object.values(patch).some((value) => {
    if (typeof value === "string") return value.toLowerCase().includes(FORCED_FAILURE);
    if (Array.isArray(value)) {
      return value.some(
        (item) => typeof item === "string" && item.toLowerCase() === FORCED_FAILURE,
      );
    }
    return false;
  });
}

export async function PATCH(request: Request): Promise<Response> {
  const auth = await authorize(request);
  if (auth.error) return auth.error;

  const body: unknown = await request.json().catch(() => null);
  const parsed = parseProfilePatch(body);
  if (!parsed.ok) {
    // `invalid_display_name` is kept for the one field that had its own code before this route
    // grew; every other field reports the generic code with its name.
    return parsed.field === "displayName"
      ? fail("invalid_display_name", 400)
      : fail("invalid_profile_patch", 400, { field: parsed.field });
  }

  // Proof hook for optimistic rollback (docs/conventions.md): outside production, any string value
  // containing "fail" errors, so a rollback can be watched on every editor.
  if (forcesFailure(parsed.patch)) return fail("forced_failure", 500);

  let saved: ProfileView | null;
  try {
    saved = await patchProfile(auth.session.user.id, parsed.patch, isAnonymous(auth.session));
  } catch (error) {
    // 23503: the user row was deleted (claimed, expired or deleted) while this write waited on it.
    if (error instanceof Error && "code" in error && error.code === "23503") saved = null;
    else throw error;
  }
  if (!saved) return fail("unauthenticated", 401);
  return json(saved);
}
