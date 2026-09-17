import { createTranslator } from "next-intl";
import { defaultLocale } from "@/i18n/config";
import messages from "@/messages/en.json";
import { sendEmail } from "./resend";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/**
 * Sends the "confirm your email" message. Returns false on failure without throwing, so a
 * delivery problem never fails sign-up after the user row exists; the user can ask for another
 * email. Logs the failure code only (no address, no link).
 */
export async function sendVerificationEmail(to: string, url: string, expiresInSeconds: number) {
  const t = createTranslator({
    locale: defaultLocale,
    messages,
    namespace: "Auth.verificationEmail",
  });
  const hours = Math.max(1, Math.round(expiresInSeconds / 3600));
  const intro = t("intro");
  const expiry = t("expiry", { hours });
  const ignore = t("ignore");
  const signature = t("signature");

  const text = [intro, "", t("action"), url, "", expiry, "", ignore, "", signature].join("\n");
  const html = `<!doctype html><html><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#111">
<p>${escapeHtml(intro)}</p>
<p><a href="${escapeHtml(url)}">${escapeHtml(t("button"))}</a></p>
<p>${escapeHtml(expiry)}</p>
<p>${escapeHtml(ignore)}</p>
<p>${escapeHtml(signature)}</p>
</body></html>`;

  const result = await sendEmail({ to, subject: t("subject"), text, html });
  if (!result.ok) console.error("[email] verification email not sent", { failure: result.failure });
  return result.ok;
}

/**
 * Sends the password reset link. Same failure handling as the verification email: logged by code,
 * never thrown, never logging the address or the link.
 */
export async function sendResetPasswordEmail(to: string, url: string, expiresInSeconds: number) {
  const t = createTranslator({
    locale: defaultLocale,
    messages,
    namespace: "Auth.resetPasswordEmail",
  });
  const hours = Math.max(1, Math.round(expiresInSeconds / 3600));
  const intro = t("intro");
  const expiry = t("expiry", { hours });
  const ignore = t("ignore");
  const signature = t("signature");

  const text = [intro, "", t("action"), url, "", expiry, "", ignore, "", signature].join("\n");
  const html = `<!doctype html><html><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#111">
<p>${escapeHtml(intro)}</p>
<p><a href="${escapeHtml(url)}">${escapeHtml(t("button"))}</a></p>
<p>${escapeHtml(expiry)}</p>
<p>${escapeHtml(ignore)}</p>
<p>${escapeHtml(signature)}</p>
</body></html>`;

  const result = await sendEmail({ to, subject: t("subject"), text, html });
  if (!result.ok)
    console.error("[email] reset password email not sent", { failure: result.failure });
  return result.ok;
}
