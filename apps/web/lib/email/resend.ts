// Transactional email through Resend's HTTP API (https://resend.com/docs/api-reference/emails/send-email),
// plain fetch like packages/ai/src/alert.ts. Never log recipients, subjects with personal data,
// bodies or links: failures report the HTTP status or the error name only.

const RESEND_URL = "https://api.resend.com/emails";
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Sender for account email. `EMAIL_FROM` in Railway; the fallback is the address the phase 06
 * contract names. The domain `pemby.app` is the verified Resend domain (docs/SETUP.md step 6).
 */
const DEFAULT_FROM = "Pemby <hello@pemby.app>";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export type SendResult = { ok: true; status: number } | { ok: false; failure: string };

export async function sendEmail(message: EmailMessage): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return { ok: false, failure: "not_configured" };
  const from = process.env.EMAIL_FROM?.trim() || DEFAULT_FROM;
  try {
    const response = await fetch(RESEND_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ from, ...message }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    await response.body?.cancel().catch(() => undefined);
    return response.ok
      ? { ok: true, status: response.status }
      : { ok: false, failure: `http_${response.status}` };
  } catch (error) {
    return { ok: false, failure: error instanceof Error ? error.name : "error" };
  }
}
