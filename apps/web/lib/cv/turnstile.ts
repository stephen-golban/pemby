// Cloudflare Turnstile server-side validation.
// https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
import { appEnv } from "@/lib/env";

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const TOKEN_MAX_LENGTH = 2048;
const TIMEOUT_MS = 5_000;

/** Widget actions, so a token minted for one form cannot be replayed against the other. */
export const TURNSTILE_ACTIONS = { upload: "cv_upload", text: "cv_text" } as const;
export type TurnstileAction = (typeof TURNSTILE_ACTIONS)[keyof typeof TURNSTILE_ACTIONS];

export type TurnstileResult = "ok" | "failed" | "misconfigured";

type SiteverifyResponse = { success?: unknown; hostname?: unknown; action?: unknown };

/** `TURNSTILE_ALLOWED_HOSTNAMES`, comma separated. Empty means "not configured". */
function allowedHostnames(): string[] {
  return (process.env.TURNSTILE_ALLOWED_HOSTNAMES ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Validates a widget token once (tokens are single-use and valid for 300 s), and checks that
 * Cloudflare reports the hostname and action we expect, so a token solved on another site or for
 * another form is refused.
 *
 * Fails closed: a network error, an unexpected response or an unconfigured hostname allowlist
 * counts as a failure. Development without `TURNSTILE_ALLOWED_HOSTNAMES` accepts any hostname, and
 * Cloudflare's test keys answer without an `action`, so an absent action is accepted there too.
 * Cloudflare's error codes are not logged.
 */
export async function verifyTurnstile(
  token: unknown,
  remoteIp: string | null,
  action: TurnstileAction,
): Promise<TurnstileResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return "misconfigured";
  const development = appEnv() === "development";
  const hostnames = allowedHostnames();
  if (hostnames.length === 0 && !development) return "misconfigured";
  if (typeof token !== "string" || token.length === 0 || token.length > TOKEN_MAX_LENGTH) {
    return "failed";
  }

  const body = new URLSearchParams({ secret, response: token });
  if (remoteIp) body.set("remoteip", remoteIp);
  let data: SiteverifyResponse;
  try {
    const response = await fetch(SITEVERIFY_URL, {
      method: "POST",
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!response.ok) return "failed";
    data = (await response.json()) as SiteverifyResponse;
  } catch {
    return "failed";
  }
  if (data.success !== true) return "failed";

  const hostname = typeof data.hostname === "string" ? data.hostname.toLowerCase() : "";
  if (hostnames.length > 0 && !hostnames.includes(hostname)) return "failed";
  const solvedAction = typeof data.action === "string" ? data.action : "";
  if (solvedAction !== action && !(solvedAction === "" && development)) return "failed";
  return "ok";
}
