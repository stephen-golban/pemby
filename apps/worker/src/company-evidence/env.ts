// Company evidence knobs. Names: COMPANY_EVIDENCE_ENABLED, COMPANY_EVIDENCE_MAX_AGE_DAYS,
// COMPANY_EVIDENCE_SWEEP_LIMIT.

export interface CompanyEvidenceEnv {
  /** Gates the scheduled sweep. Flag and manual rechecks run regardless. Default off. */
  enabled: boolean;
  /** A company is re-checked when its last check is older than this. Default 30. */
  maxAgeDays: number;
  /** Companies enqueued per sweep. Default 50. */
  sweepLimit: number;
}

type EnvLike = Readonly<Record<string, string | undefined>>;

function intFrom(env: EnvLike, name: string, fallback: number, min: number, max: number): number {
  const raw = env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer from ${min} to ${max}`);
  }
  return value;
}

function boolFrom(env: EnvLike, name: string, fallback: boolean): boolean {
  const raw = env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  throw new Error(`${name} must be true or false`);
}

export function readCompanyEvidenceEnv(env: EnvLike = process.env): CompanyEvidenceEnv {
  return {
    enabled: boolFrom(env, "COMPANY_EVIDENCE_ENABLED", false),
    maxAgeDays: intFrom(env, "COMPANY_EVIDENCE_MAX_AGE_DAYS", 30, 1, 365),
    sweepLimit: intFrom(env, "COMPANY_EVIDENCE_SWEEP_LIMIT", 50, 1, 1000),
  };
}
