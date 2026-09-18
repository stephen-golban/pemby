// The email sender: Resend's HTTP API over plain `fetch`, and the kernel's template.
//
// **Why the client is here and not imported.** `apps/web/lib/email/resend.ts` is the pattern this
// follows — same endpoint, same 10 s deadline, same rule that a failure reports a status and never
// a recipient — but the worker cannot import `apps/web` (it is a Next app, not a workspace package
// the worker depends on), so the client is **re-created here**, not factored out. Factoring it into
// `@pemby/core` was the alternative and was rejected: core is pure and isomorphic and has no
// business holding an API key or a `fetch`. That makes three raw-`fetch` Resend clients in the repo
// (this one, web's, and `packages/ai/src/alert.ts`) and no `resend` npm SDK, which is the contract's
// instruction. If a third ever becomes a fourth, the answer is a small `@pemby/email` package.
//
// **One-click unsubscribe (RFC 8058).** Gmail and Yahoo require it on bulk mail, and Resend has no
// dedicated field for it: both headers go through the generic `headers` object. The POST target
// must answer 200 or 202 with an empty body — that route is order C1's.
//
// **Idempotency.** Resend honours an `Idempotency-Key` header for 24 hours. The key is derived from
// the match, not from the claim, so the one duplicate the claim protocol admits — provider accepted,
// process died before the row was committed, a later tick re-sends — is absorbed by Resend rather
// than landing in someone's inbox twice.
import { renderMatchEmail } from "@pemby/core";
import { safeErrorLabel } from "../../cv/workers";
import { EMAIL_REQUEST_TIMEOUT_MS, TokenBucket } from "../limits";
import type { Sender, SendOutcome, SendRequest } from "./types";

const RESEND_URL = "https://api.resend.com/emails";

export interface EmailSenderOptions {
  apiKey: string;
  /** `EMAIL_FROM`, e.g. `Pemby <hello@pemby.app>`. */
  from: string;
  ratePerSecond: number;
}

/**
 * Resend's verdict.
 *
 * **Nothing here marks a channel dead.** A permanent bad address is a bounce, and a bounce arrives
 * asynchronously as an `email.bounced` webhook event — phase 09's work, per the phase-08 contract.
 * What a synchronous 4xx actually means is almost always our own request: 401/403 is a
 * misconfigured key, 422 is a payload Resend would not validate. Treating 422 as "this address is
 * dead" would let one bad render silence every email channel at once, which is precisely the
 * failure `SendOutcome`'s `dead: null` exists to avoid. So every 4xx is a bounded retry — three
 * attempts and that match is left alone — and the channel is untouched.
 */
function classifyStatus(status: number): SendOutcome {
  // Every status lands in the same place today, and the status is in the label so the logs still
  // tell 429 from 401 from 422. It is written as a function rather than inlined because this is
  // where phase 09's bounce handling will start to disagree with itself.
  return { ok: false, retryable: true, label: `resend_${status}` };
}

export function createEmailSender(options: EmailSenderOptions): Sender {
  const bucket = new TokenBucket(options.ratePerSecond);

  return {
    type: "email",

    async acquire() {
      // Resend limits the account, not the recipient, so there is no per-address pacing to do.
      await bucket.take();
    },

    async send(request: SendRequest): Promise<SendOutcome> {
      const { card, channel, links, now } = request;
      if (
        links.unsubscribeUrl === null ||
        links.unsubscribePostUrl === null ||
        links.flagUrl === null
      ) {
        // No signing secret: every link in the body would be unusable and the mail would breach
        // RFC 8058. Retryable, because setting DELIVERY_LINK_SECRET fixes it without a code change.
        return { ok: false, retryable: true, label: "resend_unsigned" };
      }

      let rendered;
      try {
        rendered = renderMatchEmail(card, {
          appUrl: links.appUrl,
          passUrl: links.passUrl,
          unsubscribeUrl: links.unsubscribeUrl,
          flagUrl: links.flagUrl,
          // No `timezone`. The template prints the freshness line as an elapsed count on every
          // channel, which is the layout the owner approved, and an elapsed count needs no zone.
          // `channel.timezone` is still read for quiet hours in `dispatch.ts`; it is only the
          // email body that has no use for it. If the planned UI pass decides an email should say
          // "seen live at 09:14 your time" — which it renders better than a chat message does —
          // the field comes back to `EmailContext` and this is where it is passed again.
          now,
        });
      } catch (error) {
        // The template refused this card. Not the channel's fault and not the address's, so the
        // channel stands; three attempts and this match is left alone.
        return { ok: false, retryable: true, label: `render_${safeErrorLabel(error)}` };
      }

      try {
        const response = await fetch(RESEND_URL, {
          method: "POST",
          headers: {
            authorization: `Bearer ${options.apiKey}`,
            "content-type": "application/json",
            "idempotency-key": `match-${card.matchId}-email`,
          },
          body: JSON.stringify({
            from: options.from,
            to: channel.address,
            subject: rendered.subject,
            html: rendered.html,
            text: rendered.text,
            headers: {
              // The POST route, not the page: RFC 8058's one-click target has to be the endpoint
              // the mailbox provider POSTs to, and `/api/unsubscribe` answers 405 to a GET.
              "List-Unsubscribe": `<${links.unsubscribePostUrl}>`,
              "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
            },
          }),
          signal: AbortSignal.timeout(EMAIL_REQUEST_TIMEOUT_MS),
        });

        if (!response.ok) {
          await response.body?.cancel().catch(() => undefined);
          return classifyStatus(response.status);
        }
        // The only field read out of the body is the message id. The body also echoes `to`, so it
        // is never logged and never stored anywhere but `provider_message_id`.
        const body = (await response.json().catch(() => null)) as { id?: unknown } | null;
        const id = typeof body?.id === "string" ? body.id : null;
        return { ok: true, providerMessageId: id };
      } catch (error) {
        // A fetch error can quote the URL and the request; keep only the error's name.
        return { ok: false, retryable: true, label: `resend_${safeErrorLabel(error)}` };
      }
    },
  };
}
