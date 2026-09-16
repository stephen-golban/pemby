import { appEnv } from "@/lib/env";

/** On in production; on staging or development only with `OWNER_GATE=on`. */
export function ownerGateEnabled(): boolean {
  return appEnv() === "production" || process.env.OWNER_GATE === "on";
}

/** `OWNER_ALLOWLIST_EMAILS`, comma-separated, case-insensitive. Empty means nobody. */
export function isAllowlistedEmail(email: string): boolean {
  const allowlist = (process.env.OWNER_ALLOWLIST_EMAILS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  return allowlist.includes(email.trim().toLowerCase());
}
