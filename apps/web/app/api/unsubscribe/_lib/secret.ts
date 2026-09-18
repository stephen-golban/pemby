// `DELIVERY_LINK_SECRET`, read once, here.
//
// The codec itself is in `@pemby/core` and takes the key as an argument, because the worker mints
// the tokens this service verifies and the two must share one implementation of the format. What
// they do not share is how they find the key: the worker resolves it in `deliver/env.ts` alongside
// the rest of its configuration, and `apps/web` resolves it here. The minimum length is the
// kernel's, so the two cannot disagree about whether a deployment is configured — a service that
// accepted a shorter key than the other would sign links the other refuses.

import { EMAIL_LINK_SECRET_MIN_LENGTH } from "@pemby/core";

/**
 * The signing key, or null when it is missing or too short.
 *
 * Never logged, never returned in a response, never compared against anything but itself. A
 * deployment without it answers `unavailable` rather than falling back to a default, which is the
 * same choice `lib/access/basic-auth.ts` makes about the staging password.
 */
export function emailLinkSecret(): string | null {
  const secret = process.env.DELIVERY_LINK_SECRET?.trim();
  return secret && secret.length >= EMAIL_LINK_SECRET_MIN_LENGTH ? secret : null;
}
