import { createHash, timingSafeEqual } from "node:crypto";

export type BasicAuthResult = "ok" | "denied" | "misconfigured";

// Hash both sides first so the comparison is constant-time regardless of input length.
function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

/** Check an `Authorization: Basic` header against `STAGING_BASIC_AUTH_USER`/`_PASSWORD`. */
export function checkStagingBasicAuth(authorization: string | null): BasicAuthResult {
  const user = process.env.STAGING_BASIC_AUTH_USER;
  const password = process.env.STAGING_BASIC_AUTH_PASSWORD;
  if (!user || !password) return "misconfigured";
  if (!authorization?.startsWith("Basic ")) return "denied";

  let decoded: string;
  try {
    decoded = Buffer.from(authorization.slice("Basic ".length).trim(), "base64").toString("utf8");
  } catch {
    return "denied";
  }
  const separator = decoded.indexOf(":");
  if (separator === -1) return "denied";

  // Evaluate both comparisons so timing does not reveal which part was wrong.
  const userOk = safeEqual(decoded.slice(0, separator), user);
  const passwordOk = safeEqual(decoded.slice(separator + 1), password);
  return userOk && passwordOk ? "ok" : "denied";
}
