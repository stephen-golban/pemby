// Fetch wrapper for reading public job-board APIs: identifies itself, times out, limits requests
// per host, and turns failures into AtsError. It never retries; the queue that called the
// connector owns retries and backoff.
import { AtsError } from "./errors";
import type { BoardRef } from "./types";

export const PEMBY_USER_AGENT = "PembyBot/0.1 (+https://pemby.app)";

export interface HostRateLimit {
  /** Requests in flight at once against this host. */
  maxConcurrent: number;
  /** Minimum gap between the starts of two requests to this host. */
  minIntervalMs: number;
}

export const DEFAULT_HOST_LIMIT: HostRateLimit = { maxConcurrent: 2, minIntervalMs: 250 };
export const DEFAULT_TIMEOUT_MS = 30_000;
/** Largest response body read into memory; a bigger one fails as `parse` instead. */
export const MAX_BODY_BYTES = 32 * 1024 * 1024;

export interface HttpClientOptions {
  userAgent?: string;
  /** Per-request timeout, including reading the body. Default 30 s. */
  timeoutMs?: number;
  /** Limit for hosts that match no entry in `hostLimits`. */
  defaultHostLimit?: HostRateLimit;
  /** Keyed by exact host, or by a suffix starting with "." that shares one limiter. */
  hostLimits?: Readonly<Record<string, HostRateLimit>>;
  /** Injected fetch, for scripts. Defaults to global fetch. */
  fetch?: typeof fetch;
}

export interface RequestOptions {
  /** The board this request is for; attributed on every AtsError. */
  ref: BoardRef;
  /**
   * True when the URL is the board's root listing. Only then does 404/410 mean
   * `board-not-found`; on any other URL it is a plain `http` error.
   */
  boardRoot?: boolean;
  signal?: AbortSignal;
  headers?: Readonly<Record<string, string>>;
  timeoutMs?: number;
  /**
   * "follow" (default): follow redirects; the response is the final one. "manual": do not
   * follow; a 3xx comes back as an HttpResponse (status, headers with `location`, empty body)
   * instead of throwing. Other statuses behave the same in both modes.
   */
  redirect?: "follow" | "manual";
}

export interface HttpResponse {
  status: number;
  /** Final URL after redirects (the requested URL when `redirect: "manual"`). */
  url: string;
  headers: Headers;
  body: string;
}

export interface HttpClient {
  /** GET, parse JSON. Throws AtsError `parse` on invalid JSON. Validate the shape yourself. */
  getJson(url: string, opts: RequestOptions): Promise<unknown>;
  /** POST a JSON body, parse a JSON response. */
  postJson(url: string, body: unknown, opts: RequestOptions): Promise<unknown>;
  /** GET, return the body as text (XML, HTML). */
  getText(url: string, opts: RequestOptions): Promise<string>;
  /** Low-level: any method; non-2xx still throws. */
  request(
    url: string,
    opts: RequestOptions & { method?: string; body?: string; accept?: string },
  ): Promise<HttpResponse>;
}

export function createHttpClient(options: HttpClientOptions = {}): HttpClient {
  const userAgent = options.userAgent ?? PEMBY_USER_AGENT;
  const defaultTimeout = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const defaultLimit = options.defaultHostLimit ?? DEFAULT_HOST_LIMIT;
  const hostLimits = options.hostLimits ?? {};
  const doFetch = options.fetch ?? globalThis.fetch;
  const limiters = new Map<string, HostLimiter>();

  function limiterFor(host: string): HostLimiter {
    const [key, limit] = matchHostLimit(host, hostLimits) ?? [host, defaultLimit];
    let limiter = limiters.get(key);
    if (!limiter) {
      limiter = new HostLimiter(limit);
      limiters.set(key, limiter);
    }
    return limiter;
  }

  async function request(
    url: string,
    opts: RequestOptions & { method?: string; body?: string; accept?: string },
  ): Promise<HttpResponse> {
    const { ref } = opts;
    const fail = (
      init: Omit<ConstructorParameters<typeof AtsError>[0], "ats" | "boardToken" | "url">,
    ) => new AtsError({ ...init, ats: ref.ats, boardToken: ref.boardToken, url });

    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch (cause) {
      throw fail({ kind: "parse", message: `invalid URL ${url}`, cause });
    }

    const callerSignal = opts.signal;
    callerSignal?.throwIfAborted();
    const release = await limiterFor(parsed.host).acquire(callerSignal);
    const timeoutMs = opts.timeoutMs ?? defaultTimeout;
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const signal = callerSignal ? AbortSignal.any([callerSignal, timeoutSignal]) : timeoutSignal;

    try {
      const headers: Record<string, string> = {
        "user-agent": userAgent,
        accept: opts.accept ?? "*/*",
        ...opts.headers,
      };
      if (
        opts.body !== undefined &&
        !Object.keys(headers).some((h) => h.toLowerCase() === "content-type")
      ) {
        headers["content-type"] = "application/json";
      }

      let res: Response;
      let body = "";
      try {
        res = await doFetch(parsed, {
          method: opts.method ?? "GET",
          headers,
          body: opts.body,
          redirect: opts.redirect ?? "follow",
          signal,
        });
        if (!res.ok) {
          await res.body?.cancel().catch(() => undefined);
        } else {
          body = await readCappedBody(res, MAX_BODY_BYTES);
        }
      } catch (cause) {
        if (callerSignal?.aborted) throw callerSignal.reason;
        if (cause instanceof BodyTooLargeError) {
          throw fail({ kind: "parse", message: `response body over ${MAX_BODY_BYTES} bytes` });
        }
        if (timeoutSignal.aborted) {
          throw fail({
            kind: "timeout",
            message: `no complete response within ${timeoutMs} ms`,
            cause,
          });
        }
        throw fail({ kind: "network", message: describe(cause), cause });
      }

      if (res.status === 429) {
        const retryAfterMs = parseRetryAfter(res.headers.get("retry-after"));
        throw fail({
          kind: "rate-limited",
          status: 429,
          message: "429 Too Many Requests",
          ...(retryAfterMs !== undefined && { retryAfterMs }),
        });
      }
      if ((res.status === 404 || res.status === 410) && opts.boardRoot) {
        throw fail({
          kind: "board-not-found",
          status: res.status,
          message: `board root returned ${res.status}`,
        });
      }
      const manualRedirect = opts.redirect === "manual" && res.status >= 300 && res.status < 400;
      if (!res.ok && !manualRedirect) {
        throw fail({ kind: "http", status: res.status, message: `HTTP ${res.status}` });
      }
      return { status: res.status, url: res.url || url, headers: res.headers, body };
    } finally {
      release();
    }
  }

  function parseJson(text: string, url: string, ref: BoardRef): unknown {
    try {
      return JSON.parse(text);
    } catch (cause) {
      throw new AtsError({
        kind: "parse",
        ats: ref.ats,
        boardToken: ref.boardToken,
        url,
        message: `invalid JSON (${text.slice(0, 80).replace(/\s+/g, " ")})`,
        cause,
      });
    }
  }

  return {
    request,
    async getJson(url, opts) {
      const res = await request(url, { ...opts, accept: "application/json" });
      return parseJson(res.body, url, opts.ref);
    },
    async postJson(url, body, opts) {
      const res = await request(url, {
        ...opts,
        method: "POST",
        body: JSON.stringify(body),
        accept: "application/json",
      });
      return parseJson(res.body, url, opts.ref);
    },
    async getText(url, opts) {
      return (await request(url, opts)).body;
    },
  };
}

function matchHostLimit(
  host: string,
  hostLimits: Readonly<Record<string, HostRateLimit>>,
): [string, HostRateLimit] | undefined {
  const exact = hostLimits[host];
  if (exact) return [host, exact];
  let best: [string, HostRateLimit] | undefined;
  for (const [key, limit] of Object.entries(hostLimits)) {
    if (key.startsWith(".") && host.endsWith(key) && (!best || key.length > best[0].length)) {
      best = [key, limit];
    }
  }
  return best;
}

/** Seconds or an HTTP date; undefined when absent or unreadable. */
export function parseRetryAfter(value: string | null, now = Date.now()): number | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed) * 1000;
  const at = Date.parse(trimmed);
  return Number.isNaN(at) ? undefined : Math.max(0, at - now);
}

class BodyTooLargeError extends Error {}

/** Reads the body as UTF-8 text, counting bytes; cancels the stream once it passes `maxBytes`. */
async function readCappedBody(res: Response, maxBytes: number): Promise<string> {
  if (!res.body) return "";
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await res.body.cancel().catch(() => undefined);
    throw new BodyTooLargeError();
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new BodyTooLargeError();
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

function describe(cause: unknown): string {
  if (cause instanceof Error) {
    const inner = cause.cause instanceof Error ? `: ${cause.cause.message}` : "";
    return `${cause.message}${inner}`;
  }
  return String(cause);
}

/** Max-concurrency plus minimum start interval, for one host (or one host suffix). */
class HostLimiter {
  private active = 0;
  private nextStartAt = 0;
  private readonly waiters: Array<() => void> = [];

  constructor(private readonly limit: HostRateLimit) {}

  async acquire(signal?: AbortSignal): Promise<() => void> {
    while (this.active >= Math.max(1, this.limit.maxConcurrent)) {
      await this.waitForRelease(signal);
    }
    // No await between the check above and this reservation, so the slot is ours.
    this.active++;
    const now = Date.now();
    const startAt = Math.max(now, this.nextStartAt);
    this.nextStartAt = startAt + this.limit.minIntervalMs;

    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      this.active--;
      this.waiters.shift()?.();
    };

    if (startAt > now) {
      try {
        await sleep(startAt - now, signal);
      } catch (error) {
        release();
        throw error;
      }
    }
    return release;
  }

  private waitForRelease(signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const onAbort = () => {
        const index = this.waiters.indexOf(wake);
        if (index >= 0) this.waiters.splice(index, 1);
        reject(signal?.reason);
      };
      const wake = () => {
        signal?.removeEventListener("abort", onAbort);
        resolve();
      };
      if (signal?.aborted) return reject(signal.reason);
      signal?.addEventListener("abort", onAbort, { once: true });
      this.waiters.push(wake);
    });
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
