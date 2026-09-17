// Network safety for fetching company pages from URLs we did not choose: only public DNS names on
// http/https ports 80 and 443, every resolved address public, and the connection pinned to the
// address that was checked (no second DNS answer between the check and the connect).
import { lookup as dnsLookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import type { LookupFunction } from "node:net";
import { BlockList, isIP } from "node:net";
import { Readable } from "node:stream";
import zlib from "node:zlib";

export interface ResolvedAddress {
  address: string;
  family: 4 | 6;
}

/** Resolves every address of a host name. */
export type HostLookup = (host: string) => Promise<ResolvedAddress[]>;

export interface TransportInit {
  headers: Record<string, string>;
  signal: AbortSignal;
  /** The checked address to connect to; the URL's host name is still used for Host and TLS SNI. */
  address: ResolvedAddress;
}

/** One HTTP GET without following redirects, connected to `init.address`. */
export type Transport = (url: URL, init: TransportInit) => Promise<Response>;

export type UnsafeReason = "scheme" | "port" | "ip-literal" | "local-name" | "single-label";

/** Why a URL may not be fetched at all, before any DNS lookup; null when its shape is fine. */
export function unsafeUrlReason(url: URL): UnsafeReason | null {
  if (url.protocol !== "https:" && url.protocol !== "http:") return "scheme";
  if (url.port !== "" && url.port !== "80" && url.port !== "443") return "port";
  if (url.username !== "" || url.password !== "") return "scheme";
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (host.startsWith("[") || isIP(host) !== 0 || /^[\d.]+$/.test(host) || /^0x/i.test(host)) {
    return "ip-literal";
  }
  if (
    host === "localhost" ||
    /\.(?:localhost|local|internal|localdomain|home|lan|intranet|corp|arpa)$/.test(host)
  ) {
    return "local-name";
  }
  if (!host.includes(".")) return "single-label";
  return null;
}

const blocked = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  blocked.addSubnet(net, prefix, "ipv4");
}
for (const [net, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["::", 96], // IPv4-compatible (deprecated)
  ["64:ff9b::", 96], // NAT64
  ["64:ff9b:1::", 48],
  ["100::", 64], // discard
  ["2001::", 23], // IETF protocol assignments (Teredo, ORCHID, ...)
  ["2001:db8::", 32], // documentation
  ["2002::", 16], // 6to4
  ["fc00::", 7], // unique local
  ["fe80::", 10], // link-local
  ["fec0::", 10], // site-local (deprecated)
  ["ff00::", 8], // multicast
] as const) {
  blocked.addSubnet(net, prefix, "ipv6");
}

/** True for a public unicast address; IPv4-mapped IPv6 addresses are judged as IPv4. */
export function isPublicAddress(address: string): boolean {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  if (mapped?.[1]) return isPublicAddress(mapped[1]);
  const family = isIP(address);
  if (family === 4) return !blocked.check(address, "ipv4");
  if (family === 6) {
    if (/^::ffff:/i.test(address)) return false; // mapped in hex form
    return !blocked.check(address, "ipv6");
  }
  return false;
}

export const systemLookup: HostLookup = async (host) => {
  const found = await dnsLookup(host, { all: true, verbatim: true });
  return found.map((a) => ({ address: a.address, family: a.family === 6 ? 6 : 4 }));
};

/**
 * The address to connect to, or null when the name does not resolve or any of its addresses is
 * not public (a name that mixes public and private answers is refused outright).
 */
export async function resolvePublicAddress(
  host: string,
  lookup: HostLookup,
): Promise<ResolvedAddress | null> {
  let addresses: ResolvedAddress[];
  try {
    addresses = await lookup(host);
  } catch {
    return null;
  }
  if (addresses.length === 0 || !addresses.every((a) => isPublicAddress(a.address))) return null;
  return addresses.find((a) => a.family === 4) ?? addresses[0] ?? null;
}

/** Multi-part public suffixes common enough to matter for company domains. */
const SECOND_LEVEL = /^(?:co|com|org|net|ac|gov|edu|ltd|plc|gen|firm|biz|info)$/;

/** "www.careers.example.co.uk" becomes "example.co.uk"; a best effort without the suffix list. */
export function registrableDomain(host: string): string {
  const labels = host.toLowerCase().replace(/\.$/, "").split(".");
  const n = labels.length;
  if (n >= 3 && SECOND_LEVEL.test(labels[n - 2] ?? "") && (labels[n - 1] ?? "").length === 2) {
    return labels.slice(n - 3).join(".");
  }
  return labels.slice(Math.max(0, n - 2)).join(".");
}

/** The name part of a registrable domain: "example" for example.co.uk and example.com. */
export function registrableName(host: string): string {
  return registrableDomain(host).split(".")[0] ?? "";
}

/** A lookup for `http.request` that always answers with the address already checked. */
function pinnedLookup(address: ResolvedAddress): LookupFunction {
  return ((_host: string, options: { all?: boolean }, callback: (...args: unknown[]) => void) => {
    if (options?.all) callback(null, [{ address: address.address, family: address.family }]);
    else callback(null, address.address, address.family);
  }) as unknown as LookupFunction;
}

const NULL_BODY_STATUS = new Set([101, 103, 204, 205, 304]);

/** GET over node:http(s), connected to the checked address; bodies are decompressed. */
export const pinnedTransport: Transport = (url, init) =>
  new Promise<Response>((resolve, reject) => {
    const client = url.protocol === "https:" ? https : http;
    const req = client.request(
      url,
      {
        method: "GET",
        headers: { ...init.headers, "accept-encoding": "gzip, deflate, br" },
        lookup: pinnedLookup(init.address),
        signal: init.signal,
        agent: false,
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const headers = new Headers();
        for (const [name, value] of Object.entries(res.headers)) {
          if (value === undefined || name === "content-encoding" || name === "content-length") {
            continue;
          }
          headers.set(name, Array.isArray(value) ? value.join(", ") : value);
        }
        if (status < 200 || status > 599 || NULL_BODY_STATUS.has(status)) {
          res.destroy();
          resolve(
            new Response(null, { status: status >= 200 && status <= 599 ? status : 502, headers }),
          );
          return;
        }
        const encoding = String(res.headers["content-encoding"] ?? "").toLowerCase();
        let body: Readable = res;
        if (encoding === "gzip" || encoding === "x-gzip") body = res.pipe(zlib.createGunzip());
        else if (encoding === "deflate") body = res.pipe(zlib.createInflate());
        else if (encoding === "br") body = res.pipe(zlib.createBrotliDecompress());
        if (body !== res) {
          body.on("close", () => res.destroy());
          res.on("error", (error) => body.destroy(error));
        }
        resolve(
          new Response(Readable.toWeb(body) as ReadableStream<Uint8Array>, { status, headers }),
        );
      },
    );
    req.on("error", reject);
    req.end();
  });
