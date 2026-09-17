import { appEnv } from "@/lib/env";

/**
 * The CV drop is on only when `CV_DROP_ENABLED=true` and the app is not production (phase 06
 * contract). Read per call so `next build` needs neither variable.
 */
export function cvDropEnabled(): boolean {
  return process.env.CV_DROP_ENABLED === "true" && appEnv() !== "production";
}

export const CV_ANON_TTL_DEFAULT_HOURS = 24;

/** Hours an anonymous upload is kept (`CV_ANON_TTL_HOURS`, 0 to 720, default 24). */
export function cvAnonTtlHours(): number {
  const raw = process.env.CV_ANON_TTL_HOURS?.trim();
  if (!raw) return CV_ANON_TTL_DEFAULT_HOURS;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 0 && value <= 720 ? value : CV_ANON_TTL_DEFAULT_HOURS;
}
