// "Something wrong with this one?" — the flag link at the foot of every match email.
//
// Two methods, one URL. **`GET` asks, `POST` writes**, for the reason the unsubscribe route spells
// out at length: a link in an email is followed by spam filters, corporate link scanners and
// inboxes that pre-render, and none of them should be able to report a job post on someone's
// behalf. The GET here reads a signed token, which is a pure function, and renders a picker.
//
// Unauthenticated on purpose. The credential is the token in the query string
// (`@pemby/core`'s `verifyEmailLinkToken`), and the job is derived from the match the token names rather
// than taken from the link, so the worst a valid token can do is flag the one post it was minted
// for.
//
// **What this route does not do.** It stores a row and stops. Whether a flag closes a job, lowers
// a company's weight or triggers a re-check is PLAN D26's automatic rules, which are phase 09;
// storing them now is what makes those rules have something to run on later.
//
// The "Wrong details" reason is deliberately missing from the five offered here. It is a two-level
// picker — which field, then which of that post's own listed values — and the second level needs
// the job in front of the person. A row saying "a detail is wrong" without saying which is a row
// nobody can act on, so the page points at the Brief for that one instead.

import { FLAG_USER_LIMIT } from "@/app/api/brief/flag/route";
import { hasFlagged, insertFlag } from "@/app/api/brief/_lib/db";
import { emailLinkSecret } from "@/app/api/unsubscribe/_lib/secret";
import { consumeRateLimit } from "@/lib/cv/rate-limit";
import { renderDeliveryString, verifyEmailLinkToken, type DeliveryStringKey } from "@pemby/core";
import { getTranslations } from "next-intl/server";
import { loadMatchJobId } from "./_lib/db";
import { htmlResponse, renderDocument } from "./_lib/document";
import type { FlagReason } from "@/app/api/brief/_lib/view";

/**
 * The five one-tap reasons, each paired with the label it already has on Telegram.
 *
 * The labels come from `@pemby/core`'s delivery table rather than from `delivery.json` so that the
 * words on a button in an email, in a chat and on this page are the same words — which is the whole
 * reason that table exists (see its header).
 */
const CHOICES: ReadonlyArray<{ value: FlagReason; key: DeliveryStringKey }> = [
  { value: "closed_or_fake", key: "flag-label-closed-or-fake" },
  { value: "not_hiring_from_country", key: "flag-label-not-hiring-from-country" },
  { value: "scam", key: "flag-label-scam" },
  { value: "duplicate", key: "flag-label-duplicate" },
  { value: "other", key: "flag-label-other" },
];

const BRIEF_PATH = "/brief";

type Copy = Awaited<ReturnType<typeof getTranslations<"Delivery.flag">>>;

/**
 * One answer for every unusable link.
 *
 * Expired, tampered with, minted for the other endpoint, or arriving at a deployment with no
 * signing key: all of them render this. Telling them apart would be an oracle for whoever is
 * holding the token, and there is nothing the owner of the mailbox could do differently with the
 * distinction.
 */
function expired(copy: Copy, status: number): Response {
  return htmlResponse(
    renderDocument({
      title: copy("title"),
      heading: copy("expiredTitle"),
      lead: copy("expiredLead"),
      linkHref: BRIEF_PATH,
      linkLabel: copy("brief"),
    }),
    status,
  );
}

function terminal(copy: Copy, lead: string, status: number): Response {
  return htmlResponse(
    renderDocument({
      title: copy("title"),
      heading: copy("title"),
      lead,
      linkHref: BRIEF_PATH,
      linkLabel: copy("brief"),
    }),
    status,
  );
}

/** The token, exactly as it arrived, for the form to post straight back. */
function tokenOf(request: Request): string {
  return new URL(request.url).searchParams.get("t") ?? "";
}

/** The picker. Reads, renders, changes nothing. */
export async function GET(request: Request): Promise<Response> {
  const copy = await getTranslations("Delivery.flag");
  const secret = emailLinkSecret();
  if (!secret) return expired(copy, 503);

  const token = tokenOf(request);
  if (!verifyEmailLinkToken(secret, token, "flag", new Date())) return expired(copy, 400);

  return htmlResponse(
    renderDocument({
      title: copy("title"),
      heading: renderDeliveryString("prompt-flag-reason"),
      lead: copy("lead"),
      choices: CHOICES.map((choice) => ({
        value: choice.value,
        label: renderDeliveryString(choice.key),
      })),
      action: `/api/flag-from-email?t=${encodeURIComponent(token)}`,
      note: copy("details"),
      linkHref: BRIEF_PATH,
      linkLabel: copy("brief"),
    }),
    200,
  );
}

/** The answer. The only method here that writes anything. */
export async function POST(request: Request): Promise<Response> {
  const copy = await getTranslations("Delivery.flag");
  const secret = emailLinkSecret();
  if (!secret) return expired(copy, 503);

  const claims = verifyEmailLinkToken(secret, tokenOf(request), "flag", new Date());
  if (!claims) return expired(copy, 400);

  const form = await request.formData().catch(() => null);
  const picked = form?.get("reason");
  const choice = CHOICES.find((candidate) => candidate.value === picked);
  if (!choice) return expired(copy, 400);

  try {
    const jobId = await loadMatchJobId(claims.subject, claims.userId);
    if (jobId === null) return expired(copy, 400);

    // A duplicate is refused before the counter is touched, so the daily limit counts stored flags
    // — the same order, and the same counter and key, as `/api/brief/flag`. One person has one
    // daily allowance however they report.
    if (await hasFlagged(claims.userId, jobId)) {
      return terminal(copy, copy("already"), 200);
    }
    const within = await consumeRateLimit(
      `flag:user:${claims.userId}`,
      FLAG_USER_LIMIT.windowSeconds,
      FLAG_USER_LIMIT.max,
    );
    if (!within) {
      return terminal(copy, renderDeliveryString("toast-flag-limit"), 429);
    }

    const stored = await insertFlag(claims.userId, { jobId, reason: choice.value });
    return terminal(copy, stored ? renderDeliveryString("toast-flagged") : copy("already"), 200);
  } catch {
    // Never inspected and never logged: a database error here can carry a row value, and a row
    // value in this feature is somebody's personal data.
    return terminal(copy, copy("failed"), 503);
  }
}
