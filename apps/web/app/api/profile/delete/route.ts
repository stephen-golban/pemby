import { deleteCvObject } from "@/lib/cv/bucket";
import { deleteUserAndCvRows, listCvBucketKeys } from "../_lib/db";
import { authorize, fail } from "../_lib/http";
import { DELETE_CONFIRMATION } from "../_lib/view";

/**
 * `POST /api/profile/delete` — delete this account and everything attached to it.
 *
 * Order matters: `cv_files.user_id` is ON DELETE RESTRICT because a row points at a bucket object
 * Postgres cannot delete, so the objects go first, then the rows and the user in one transaction
 * (`deleteUserAndCvRows`). Everything else cascades from the user row: sessions, accounts, the
 * profile and its embedding, pending claims, matches, applications, channels.
 *
 * Every statement is scoped by the session's own user id; no other user's rows are reachable from
 * this route. A bucket failure aborts before anything in the database changes, so the call can be
 * retried without orphaning an object.
 *
 * The response expires the session cookies, and the session rows are gone anyway, so the caller is
 * signed out whichever the browser honours first.
 */
export async function POST(request: Request): Promise<Response> {
  const auth = await authorize(request);
  if (auth.error) return auth.error;

  const body: unknown = await request.json().catch(() => null);
  const confirm =
    body && typeof body === "object" && "confirm" in body
      ? (body as { confirm: unknown }).confirm
      : null;
  if (typeof confirm !== "string" || confirm.trim() !== DELETE_CONFIRMATION) {
    return fail("invalid_confirmation", 400);
  }

  const userId = auth.session.user.id;
  try {
    // Bucket first: a row is the only record of an object's key.
    for (const key of await listCvBucketKeys(userId)) {
      await deleteCvObject(key);
    }
    await deleteUserAndCvRows(userId);
  } catch (error) {
    // Bucket and database errors can carry file names or SQL text; log a name and a code only.
    console.error("[profile] account not deleted", {
      error: error instanceof Error ? error.name : "error",
    });
    return fail("delete_failed", 503);
  }

  const headers = expiredAuthCookies(request);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  return new Response(JSON.stringify({ deleted: true }), { status: 200, headers });
}

/**
 * `Set-Cookie` headers clearing every auth cookie the request carried. Names are matched rather
 * than hard-coded: Better Auth prefixes them with `__Secure-` when the base URL is https.
 */
function expiredAuthCookies(request: Request): Headers {
  const headers = new Headers();
  const cookie = request.headers.get("cookie") ?? "";
  const secure = new URL(request.url).protocol === "https:";
  const seen = new Set<string>();
  for (const part of cookie.split(";")) {
    const name = part.split("=")[0]?.trim();
    if (!name || seen.has(name) || !name.includes("better-auth")) continue;
    seen.add(name);
    headers.append(
      "Set-Cookie",
      `${name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`,
    );
  }
  return headers;
}
