// The links a match message carries, and the signed tokens on the two that act without a session.
//
// Everything user-visible is built from one origin (`DELIVER_APP_URL`), so staging links point at
// staging and nothing has a hostname baked into it.
//
// **The token is the kernel's, not this module's.** `mintEmailLinkToken` now lives in
// `packages/core/src/delivery/email/token.ts` and is exported from `@pemby/core`; `apps/web`'s
// `/api/unsubscribe` and `/api/flag-from-email` verify with `verifyEmailLinkToken` from the same
// place. This file held a copy of the minting half for as long as the format lived in `apps/web`,
// which the worker cannot import — one signing format in two copies breaks every link already
// sitting in an inbox the first time one copy is edited, and that copy is now gone.
//
// Two rules the format enforces, both argued in the kernel's own header:
//   - the purpose is inside the signed region, so an unsubscribe token is refused at the flag
//     endpoint rather than being a second way in;
//   - nothing user-visible is a bare id in a query string that was not signed.
import { mintEmailLinkToken } from "@pemby/core";

/** Every link a match message can carry, for one match on one channel. */
export interface MessageLinks {
  /** Absolute origin, no trailing slash. What the email template builds its own URLs from. */
  appUrl: string;
  /** PLAN D13's upgrade note, on a free-tier card. */
  passUrl: string;
  briefUrl: string;
  settingsUrl: string;
  /**
   * Where the "Stop these emails" link in the **body** goes: a page that renders a button.
   *
   * Not the same URL as `unsubscribePostUrl`, and deliberately so. `/api/unsubscribe` answers 405
   * to a GET, because a GET that unsubscribed people would be followed by every link scanner and
   * pre-rendering inbox that ever read the message. Null when no signing secret is configured.
   */
  unsubscribeUrl: string | null;
  /**
   * The RFC 8058 one-click target, for the `List-Unsubscribe` header: the POST endpoint itself.
   *
   * The kernel's `EmailContext` has one unsubscribe field and its comment assumes one URL serves
   * both places. It cannot: the header needs the POST route and the body needs the page. See the
   * report.
   */
  unsubscribePostUrl: string | null;
  /** "Something wrong with this one?" for this match. */
  flagUrl: string | null;
}

export interface LinkParams {
  appUrl: string;
  /** `DELIVERY_LINK_SECRET`. Null disables every signed link, and with it email. */
  secret: string | null;
  userId: string;
  matchId: string;
  /** The channel being unsubscribed — not the user, so one link never silences every channel. */
  channelId: string;
  /** Explicit clock: the token's expiry is measured from here. */
  now: Date;
}

export function buildMessageLinks(params: LinkParams): MessageLinks {
  const { appUrl, secret, userId, matchId, channelId, now } = params;

  const base: Omit<MessageLinks, "unsubscribeUrl" | "unsubscribePostUrl" | "flagUrl"> = {
    appUrl,
    passUrl: `${appUrl}/pricing`,
    briefUrl: `${appUrl}/brief`,
    settingsUrl: `${appUrl}/settings`,
  };
  if (secret === null) {
    return { ...base, unsubscribeUrl: null, unsubscribePostUrl: null, flagUrl: null };
  }

  const unsubscribeToken = mintEmailLinkToken(secret, {
    purpose: "unsubscribe",
    userId,
    subject: channelId,
    issuedAt: now,
  });
  const flagToken = mintEmailLinkToken(secret, {
    purpose: "flag",
    userId,
    subject: matchId,
    issuedAt: now,
  });

  return {
    ...base,
    unsubscribeUrl: `${appUrl}/unsubscribe?t=${unsubscribeToken}`,
    unsubscribePostUrl: `${appUrl}/api/unsubscribe?t=${unsubscribeToken}`,
    flagUrl: `${appUrl}/api/flag-from-email?t=${flagToken}`,
  };
}
