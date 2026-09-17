// CV drop knobs for the worker (phase 06). Names are listed in .env.example.
//
// CV_DROP_ENABLED    "true" registers the cv queues' handlers and the cleanup schedule. Ignored on
//                    APP_ENV=production, where the CV drop is always off.
// CV_ANON_TTL_HOURS  hours an anonymous upload (or an anonymous user without one) is kept before
//                    cleanup, default 24, 0 to 720. The cleanup job reads it again on every run.
// BUCKET, ENDPOINT, REGION, ACCESS_KEY_ID, SECRET_ACCESS_KEY
//                    Railway bucket reference variables. Required when the drop is enabled.

type EnvLike = Record<string, string | undefined>;

export interface CvBucketEnv {
  bucket: string;
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export interface CvEnv {
  enabled: boolean;
  appEnv: string;
  anonTtlHours: number;
  /** Null when the drop is disabled (bucket variables are then not required). */
  bucket: CvBucketEnv | null;
}

export const CV_ANON_TTL_DEFAULT_HOURS = 24;

/** Reads CV_ANON_TTL_HOURS; throws on a value that is not an integer from 0 to 720. */
export function readCvAnonTtlHours(env: EnvLike = process.env): number {
  const raw = env.CV_ANON_TTL_HOURS?.trim();
  if (!raw) return CV_ANON_TTL_DEFAULT_HOURS;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0 || value > 720) {
    throw new Error("CV_ANON_TTL_HOURS must be an integer from 0 to 720");
  }
  return value;
}

export function readCvEnv(env: EnvLike = process.env): CvEnv {
  const appEnv = env.APP_ENV?.trim() || "development";
  const enabled = env.CV_DROP_ENABLED?.trim() === "true" && appEnv !== "production";
  const anonTtlHours = readCvAnonTtlHours(env);
  if (!enabled) return { enabled, appEnv, anonTtlHours, bucket: null };

  const names = ["BUCKET", "ENDPOINT", "REGION", "ACCESS_KEY_ID", "SECRET_ACCESS_KEY"] as const;
  const missing = names.filter((n) => !env[n]?.trim());
  if (missing.length > 0) {
    throw new Error(`CV_DROP_ENABLED is true but ${missing.join(", ")} not set`);
  }
  return {
    enabled,
    appEnv,
    anonTtlHours,
    bucket: {
      bucket: env.BUCKET!.trim(),
      endpoint: env.ENDPOINT!.trim(),
      region: env.REGION!.trim(),
      accessKeyId: env.ACCESS_KEY_ID!.trim(),
      secretAccessKey: env.SECRET_ACCESS_KEY!.trim(),
    },
  };
}
