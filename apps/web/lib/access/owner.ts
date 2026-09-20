// The owner-only gate. **Separate from `getProductAccess` on purpose**; read the reason before
// reaching for the shorter one.
//
// `getProductAccess` (`lib/auth/session.ts:20`) checks the allowlist **only when
// `ownerGateEnabled()` is true**, which is `appEnv() === "production" || OWNER_GATE === "on"`
// (`lib/access/owner-gate.ts:4`). Staging has no `OWNER_GATE` variable and open sign-up, so on
// staging today `getProductAccess` answers `ok` for *any* account that signs itself up — and it
// would answer the same in production the day sign-up opens to real users.
//
// That is the right behaviour for every other product page, because each one shows the caller
// their own rows and nobody else's. This one shows other people's flags, other people's jobs and
// Pemby's own spend, so it asks the allowlist question **unconditionally** and refuses everything
// else. No admin page and no admin route handler may use `getProductAccess` instead.

import { isAllowlistedEmail } from "@/lib/access/owner-gate";
import { getSession } from "@/lib/auth/session";
import type { Session } from "@/lib/auth/session";

/**
 * Whether this session belongs to the owner. Pure, so it can be reasoned about on its own.
 *
 * Three refusals, in order: no session at all, an anonymous session (`better-auth`'s anonymous
 * plugin gives those a synthesised address, which must never be matched against an allowlist), and
 * an address that is not on `OWNER_ALLOWLIST_EMAILS`. An empty allowlist means nobody, which is the
 * correct closed default for a deploy that forgot the variable.
 *
 * **`emailVerified` is deliberately not a condition here**, and the reason is worth stating because
 * it is the first thing a reviewer reaches for. Verification is enforced upstream, where it can be:
 * `requireEmailVerification` is on wherever public sign-up is open (`lib/auth/codes.ts:26`), so an
 * unverified impostor holding an allowlisted address cannot obtain a session in the first place,
 * and a social sign-in proves the address at the provider. Production has sign-up closed and its
 * owner account was created before there was a verification step, so adding the condition here
 * would lock the owner out of this page on the one environment that matters most.
 */
export function isOwner(session: Session | null): boolean {
  if (!session) return false;
  if (session.user.isAnonymous === true) return false;
  const email = session.user.email;
  if (typeof email !== "string" || email.trim() === "") return false;
  return isAllowlistedEmail(email);
}

export type OwnerAccess =
  { status: "ok"; session: Session } | { status: "unauthenticated" } | { status: "forbidden" };

/**
 * The gate every `/admin` page and every `/api/admin` route handler runs. Validates the session
 * cookie against the database (`getSession`), then applies `isOwner`.
 *
 * `unauthenticated` and `forbidden` are kept apart so a page can send a signed-out visitor to
 * sign-in while a signed-in stranger gets a flat 403 — and so a stranger is never told that signing
 * in would have helped.
 */
export async function getOwnerAccess(headers: Headers): Promise<OwnerAccess> {
  const session = await getSession(headers);
  if (!session) return { status: "unauthenticated" };
  return isOwner(session) ? { status: "ok", session } : { status: "forbidden" };
}
