import type { AtsKind } from "@pemby/core/private-config";

/**
 * - `board-not-found`: the board itself is gone (404/410 on the board root, or the vendor's
 *   equivalent). The only kind that says anything about the board's jobs.
 * - `rate-limited`: 429; `retryAfterMs` is set when the vendor sent Retry-After.
 * - `http`: any other non-2xx status (`status` is set).
 * - `network`: DNS, TLS, connection reset.
 * - `timeout`: the per-request timeout fired.
 * - `parse`: the body was not the JSON/XML/shape the connector expects.
 *
 * Every kind except `board-not-found` is transient: never close jobs because of it.
 */
export type AtsErrorKind =
  "board-not-found" | "rate-limited" | "http" | "network" | "timeout" | "parse";

export interface AtsErrorInit {
  kind: AtsErrorKind;
  ats: AtsKind;
  boardToken: string;
  message: string;
  status?: number;
  retryAfterMs?: number;
  url?: string;
  cause?: unknown;
}

export class AtsError extends Error {
  override readonly name = "AtsError";
  readonly kind: AtsErrorKind;
  readonly ats: AtsKind;
  readonly boardToken: string;
  readonly status?: number;
  readonly retryAfterMs?: number;
  readonly url?: string;

  constructor(init: AtsErrorInit) {
    super(`[${init.ats}:${init.boardToken}] ${init.kind}: ${init.message}`, { cause: init.cause });
    this.kind = init.kind;
    this.ats = init.ats;
    this.boardToken = init.boardToken;
    if (init.status !== undefined) this.status = init.status;
    if (init.retryAfterMs !== undefined) this.retryAfterMs = init.retryAfterMs;
    if (init.url !== undefined) this.url = init.url;
  }
}

export function isAtsError(value: unknown): value is AtsError {
  return value instanceof AtsError;
}
