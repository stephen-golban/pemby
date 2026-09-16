import { PrivateConfigError } from "./errors";

export type AppEnv = "development" | "staging" | "production";

export type PrivateConfigSource =
  | { kind: "dir"; appEnv: AppEnv; dir: string }
  | { kind: "github"; appEnv: AppEnv; repo: string; ref: string; token: string };

export type EnvLike = Readonly<Record<string, string | undefined>>;

const REPO_PATTERN = /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/;
const REF_PATTERN = /^[A-Za-z0-9._\-/]{1,255}$/;

/**
 * `APP_ENV`, defaulting to development only on a laptop. On a deployed host (Railway sets
 * `RAILWAY_ENVIRONMENT_NAME`) or under `NODE_ENV=production`, a missing `APP_ENV` fails closed so
 * a misconfigured service can never load placeholder config as if it were development.
 */
function readAppEnv(env: EnvLike): AppEnv {
  const raw = env.APP_ENV?.trim();
  if (!raw) {
    if (env.RAILWAY_ENVIRONMENT_NAME?.trim() || env.NODE_ENV?.trim() === "production") {
      throw new PrivateConfigError(
        "invalid-env",
        "APP_ENV is not set on a deployed host (RAILWAY_ENVIRONMENT_NAME or NODE_ENV=production is present); set APP_ENV to staging or production.",
      );
    }
    return "development";
  }
  if (raw === "development" || raw === "staging" || raw === "production") return raw;
  throw new PrivateConfigError(
    "invalid-env",
    "APP_ENV must be development, staging or production.",
  );
}

/** Decide where config comes from. Pure: reads only the env object it is given. */
export function resolvePrivateConfigSource(env: EnvLike): PrivateConfigSource {
  const appEnv = readAppEnv(env);
  const dir = env.PRIVATE_CONFIG_DIR?.trim();
  if (dir) return { kind: "dir", appEnv, dir };

  const repo = env.PRIVATE_CONFIG_REPO?.trim();
  if (!repo) {
    const hint =
      appEnv === "development"
        ? " For local work set PRIVATE_CONFIG_DIR=./private-config.example."
        : "";
    throw new PrivateConfigError(
      "not-configured",
      `No private config source for APP_ENV=${appEnv}: set PRIVATE_CONFIG_REPO (with PRIVATE_CONFIG_REF and PRIVATE_CONFIG_TOKEN) or PRIVATE_CONFIG_DIR.${hint}`,
    );
  }
  if (!REPO_PATTERN.test(repo)) {
    throw new PrivateConfigError("invalid-env", "PRIVATE_CONFIG_REPO must look like owner/repo.");
  }

  let ref = env.PRIVATE_CONFIG_REF?.trim();
  if (!ref) {
    if (appEnv === "production") {
      throw new PrivateConfigError(
        "invalid-env",
        "PRIVATE_CONFIG_REF is required in production; pin it to a tag or commit sha.",
      );
    }
    ref = "main";
  }
  if (!REF_PATTERN.test(ref) || ref.includes("..")) {
    throw new PrivateConfigError("invalid-env", "PRIVATE_CONFIG_REF is not a valid git ref.");
  }

  const token = env.PRIVATE_CONFIG_TOKEN?.trim();
  if (!token) {
    throw new PrivateConfigError(
      "missing-token",
      `PRIVATE_CONFIG_TOKEN is not set; cannot fetch ${repo}@${ref} (APP_ENV=${appEnv}).`,
    );
  }
  return { kind: "github", appEnv, repo, ref, token };
}
