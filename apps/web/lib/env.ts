export type AppEnv = "production" | "staging" | "development";

/**
 * `APP_ENV` decides environment behaviour (docs/conventions.md). Read per call, never at import,
 * so `next build` does not need it.
 *
 * Unset is only allowed outside a production Node build: `next dev` defaults to development.
 * Under `NODE_ENV=production` (`next start`, Railway) a missing or unknown value throws, so the
 * staging password and owner gate can never be skipped by a missing variable.
 */
export function appEnv(): AppEnv {
  const value = process.env.APP_ENV;
  if (value === "production" || value === "staging" || value === "development") return value;
  if ((value === undefined || value === "") && process.env.NODE_ENV !== "production") {
    return "development";
  }
  throw new Error(
    "APP_ENV must be set to production, staging or development (it is required when NODE_ENV=production)",
  );
}
