import { isAllowlistedEmail, ownerGateEnabled } from "@/lib/access/owner-gate";
import { getAuth } from "./server";

export type Session = NonNullable<
  Awaited<ReturnType<ReturnType<typeof getAuth>["api"]["getSession"]>>
>;

/** Validates the session cookie against the database (not a cookie-presence check). */
export async function getSession(headers: Headers): Promise<Session | null> {
  return getAuth().api.getSession({ headers });
}

export type ProductAccess =
  { status: "ok"; session: Session } | { status: "unauthenticated" } | { status: "forbidden" };

/**
 * Authorization for product routes. Needs a session; with the owner gate on, the session must be a
 * real (non-anonymous) account whose email is on the allowlist.
 */
export async function getProductAccess(headers: Headers): Promise<ProductAccess> {
  const session = await getSession(headers);
  if (!session) return { status: "unauthenticated" };
  if (ownerGateEnabled()) {
    if (session.user.isAnonymous || !isAllowlistedEmail(session.user.email)) {
      return { status: "forbidden" };
    }
  }
  return { status: "ok", session };
}
