export type PrivateConfigErrorCode =
  | "not-configured"
  | "invalid-env"
  | "missing-token"
  | "fetch-failed"
  | "invalid-layout"
  | "invalid-file"
  | "placeholder-not-allowed"
  | "not-found";

/**
 * Every loader failure. Messages name env vars, repo, ref, HTTP status and file paths only.
 * They never contain the token or file contents, so they are safe to log.
 */
export class PrivateConfigError extends Error {
  readonly code: PrivateConfigErrorCode;

  constructor(code: PrivateConfigErrorCode, message: string) {
    super(`[private-config] ${message}`);
    this.name = "PrivateConfigError";
    this.code = code;
  }
}

/** Belt and braces: strip any secret value that somehow reached a message. */
export function redact(message: string, secrets: ReadonlyArray<string | undefined>): string {
  let out = message;
  for (const secret of secrets) {
    if (secret && secret.length >= 4) out = out.split(secret).join("[redacted]");
  }
  return out;
}
