// Polite HTML fetching for company pages: the ATS client's user agent, robots.txt per origin, one
// request per second per host, a body size cap, HTML only, and redirects followed by hand so every
// hop stays on the company's own domain, passes robots.txt and the network checks in net.ts (public
// DNS names only, every resolved address public, the connection pinned to the checked address).
import { PEMBY_USER_AGENT } from "@pemby/ats";
import {
  pinnedTransport,
  resolvePublicAddress,
  systemLookup,
  unsafeUrlReason,
  type HostLookup,
  type Transport,
} from "./net";
import { ALLOW_ALL, parseRobots, type RobotsRules } from "./robots";

export const COMPANY_PAGE_TIMEOUT_MS = 15_000;
/**
 * Bytes of HTML read per page; the rest is cut off. Handbook and docs pages can carry megabytes of
 * sidebar before their main content, so the read cap is generous and the main content is cut to
 * COMPANY_PAGE_MAX_BYTES after it is extracted (discover.ts).
 */
export const COMPANY_PAGE_MAX_RAW_BYTES = 6 * 1024 * 1024;
/** Characters of main-content HTML turned into text per page. */
export const COMPANY_PAGE_MAX_BYTES = 1536 * 1024;
export const COMPANY_HOST_INTERVAL_MS = 1_000;
const MAX_REDIRECTS = 5;
const ROBOTS_PRODUCT_TOKEN = "PembyBot";

export type PageFetchResult =
  | { ok: true; url: string; requestedUrl: string; html: string; fetchedAt: Date }
  | {
      ok: false;
      requestedUrl: string;
      url: string;
      reason:
        | "robots"
        | "robots-unreachable"
        | "off-domain"
        | "unsafe"
        | "not-html"
        | "http"
        | "timeout"
        | "network"
        | "too-many-redirects";
      status?: number;
    };

export interface PageFetcherOptions {
  /** True for hosts we may read (the company's own domain and its subdomains). */
  isAllowedHost: (host: string) => boolean;
  userAgent?: string;
  minIntervalMs?: number;
  timeoutMs?: number;
  maxBytes?: number;
  /** Sends one request to a checked address. Default: node:http(s) pinned to that address. */
  transport?: Transport;
  /** Resolves host names. Default: the system resolver. */
  lookup?: HostLookup;
  signal?: AbortSignal;
}

export interface PageFetcher {
  get(url: string): Promise<PageFetchResult>;
  /** Requests sent, robots.txt included. */
  readonly requests: number;
}

/** The host is not a public DNS name or resolves to a non-public address. */
class UnsafeHostError extends Error {
  constructor() {
    super("unsafe host");
    this.name = "UnsafeHostError";
  }
}

/** Reads at most `maxBytes` of the body as UTF-8 and cancels the rest of the stream. */
export async function readCapped(res: Response, maxBytes: number): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const room = maxBytes - bytes;
    bytes += value.byteLength;
    if (value.byteLength >= room) {
      text += decoder.decode(value.subarray(0, room), { stream: true });
      await reader.cancel().catch(() => undefined);
      break;
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
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

export function createPageFetcher(options: PageFetcherOptions): PageFetcher {
  const userAgent = options.userAgent ?? PEMBY_USER_AGENT;
  const minInterval = options.minIntervalMs ?? COMPANY_HOST_INTERVAL_MS;
  const timeoutMs = options.timeoutMs ?? COMPANY_PAGE_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? COMPANY_PAGE_MAX_RAW_BYTES;
  const transport = options.transport ?? pinnedTransport;
  const lookup = options.lookup ?? systemLookup;
  const { signal } = options;
  const nextSlot = new Map<string, number>();
  const robots = new Map<string, Promise<RobotsRules | "unreachable">>();
  let requests = 0;

  /** Serializes requests per host with a minimum gap between their starts. */
  async function slot(host: string): Promise<void> {
    const now = Date.now();
    const at = Math.max(now, nextSlot.get(host) ?? 0);
    nextSlot.set(host, at + minInterval);
    if (at > now) await wait(at - now, signal);
  }

  /** Checks the URL and its addresses, then sends. Throws UnsafeHostError before any request. */
  async function send(url: URL, accept: string): Promise<Response> {
    signal?.throwIfAborted();
    if (unsafeUrlReason(url)) throw new UnsafeHostError();
    await slot(url.host);
    const address = await resolvePublicAddress(url.hostname, lookup);
    if (!address) throw new UnsafeHostError();
    requests += 1;
    const timeout = AbortSignal.timeout(timeoutMs);
    return transport(url, {
      headers: { "user-agent": userAgent, accept },
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      address,
    });
  }

  /** Rules for the origin, or "unreachable" (5xx or no answer: RFC 9309 says assume disallow). */
  function robotsFor(origin: URL): Promise<RobotsRules | "unreachable"> {
    const key = origin.origin;
    let pending = robots.get(key);
    if (!pending) {
      pending = (async () => {
        try {
          let target = new URL("/robots.txt", origin);
          for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
            const res = await send(target, "text/plain,*/*;q=0.5");
            if (res.status >= 300 && res.status < 400) {
              await res.body?.cancel().catch(() => undefined);
              const location = res.headers.get("location");
              if (!location) return ALLOW_ALL;
              const next = new URL(location, target);
              // A redirect off the company's domain, or to a host we may not contact, is not
              // followed: the site has no robots rules we can read.
              if (unsafeUrlReason(next) || !options.isAllowedHost(next.hostname)) return ALLOW_ALL;
              if (!(await resolvePublicAddress(next.hostname, lookup))) return ALLOW_ALL;
              target = next;
              continue;
            }
            // RFC 9309: 4xx means no restrictions; 5xx or unreachable means assume full disallow.
            if (res.status >= 400 && res.status < 500) {
              await res.body?.cancel().catch(() => undefined);
              return ALLOW_ALL;
            }
            if (!res.ok) {
              await res.body?.cancel().catch(() => undefined);
              return "unreachable";
            }
            return parseRobots(await readCapped(res, 512 * 1024), ROBOTS_PRODUCT_TOKEN);
          }
          return ALLOW_ALL;
        } catch (error) {
          if (signal?.aborted) throw error;
          if (error instanceof UnsafeHostError) return ALLOW_ALL;
          return "unreachable";
        }
      })();
      robots.set(key, pending);
    }
    return pending;
  }

  async function get(requestedUrl: string): Promise<PageFetchResult> {
    let url = new URL(requestedUrl);
    const fail = (
      reason: Extract<PageFetchResult, { ok: false }>["reason"],
      status?: number,
    ): PageFetchResult => ({
      ok: false,
      requestedUrl,
      url: url.href,
      reason,
      ...(status === undefined ? {} : { status }),
    });

    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      if (url.protocol !== "https:" && url.protocol !== "http:") return fail("unsafe");
      if (!options.isAllowedHost(url.hostname)) {
        return fail(unsafeUrlReason(url) ? "unsafe" : "off-domain");
      }
      if (unsafeUrlReason(url) || !(await resolvePublicAddress(url.hostname, lookup))) {
        return fail("unsafe");
      }
      const rules = await robotsFor(url);
      if (rules === "unreachable") return fail("robots-unreachable");
      if (!rules.isAllowed(url.pathname + url.search)) return fail("robots");

      let res: Response;
      try {
        res = await send(url, "text/html,application/xhtml+xml;q=0.9");
      } catch (error) {
        if (signal?.aborted) throw error;
        if (error instanceof UnsafeHostError) return fail("unsafe");
        const name = error instanceof Error ? error.name : "";
        return fail(name === "TimeoutError" || name === "AbortError" ? "timeout" : "network");
      }

      if (res.status >= 300 && res.status < 400) {
        await res.body?.cancel().catch(() => undefined);
        const location = res.headers.get("location");
        if (!location) return fail("http", res.status);
        url = new URL(location, url);
        url.hash = "";
        continue;
      }
      if (!res.ok) {
        await res.body?.cancel().catch(() => undefined);
        return fail("http", res.status);
      }
      const type = res.headers.get("content-type") ?? "";
      if (!/text\/html|application\/xhtml\+xml/i.test(type)) {
        await res.body?.cancel().catch(() => undefined);
        return fail("not-html", res.status);
      }
      try {
        const html = await readCapped(res, maxBytes);
        return { ok: true, url: url.href, requestedUrl, html, fetchedAt: new Date() };
      } catch (error) {
        if (signal?.aborted) throw error;
        const name = error instanceof Error ? error.name : "";
        return fail(name === "TimeoutError" || name === "AbortError" ? "timeout" : "network");
      }
    }
    return fail("too-many-redirects");
  }

  return {
    get,
    get requests() {
      return requests;
    },
  };
}
