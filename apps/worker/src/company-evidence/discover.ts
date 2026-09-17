// Finds a company's public careers and hiring-policy pages on its own domain: a fixed set of
// candidate paths, then links from those pages whose anchor text or path names hiring locations.
// Keeps only pages whose text talks about where the company hires, trimmed to those passages. Job
// detail pages are skipped and job listings (links to roles, runs of job cards) are left out of the
// text: a role's location is not the company's hiring policy.
import { decodeHtmlEntities, htmlToText } from "@pemby/ats";
import { findPlaceMentions } from "@pemby/core";
import {
  COMPANY_PAGE_MAX_BYTES,
  createPageFetcher,
  type PageFetcher,
  type PageFetchResult,
} from "./fetch";
import {
  registrableDomain,
  registrableName,
  unsafeUrlReason,
  type HostLookup,
  type Transport,
} from "./net";
import {
  JOB_DETAIL_PATH,
  JOB_QUERY,
  hasPolicyLanguage,
  isJobDetailPage,
  isJobDetailUrl,
  withoutJobListings,
} from "./policy";

/** HTML pages read per company. */
export const MAX_PAGES_PER_COMPANY = 6;
/** Page requests per company (robots.txt not counted); 404s on candidate paths use these up. */
export const MAX_ATTEMPTS_PER_COMPANY = 12;
/** Characters of trimmed page text sent to the model, per page and in total. */
const MAX_EXCERPT_CHARS_PER_PAGE = 8_000;
const MAX_EXCERPT_CHARS_TOTAL = 24_000;

/** Tried first. */
const PRIMARY_PATHS = ["/careers", "/jobs"] as const;
/** Tried after the links found on the primary pages and the homepage. */
const SECONDARY_PATHS = [
  "/remote",
  "/about/careers",
  "/company/careers",
  "/join",
  "/join-us",
  "/careers/remote",
] as const;

/** Words that mark a passage about where a company hires. */
const HIRING_LINE =
  /\b(hire|hires|hiring|hired|remote|remotely|countr(?:y|ies)|locations?|anywhere|worldwide|globally|global team|distributed|contractors?|employer of record|EOR|PEO|time ?zones?|relocat\w*|based in|legal entit(?:y|ies)|work from)\b/i;
/** A page is worth sending only if it names hiring locations or says "anywhere". */
const HIRING_PAGE =
  /\b(where we hire|hire (?:in|from)|hiring (?:in|from)|we hire|countries|country|remote|anywhere|worldwide|employer of record|contractors?|locations?)\b/i;
const WORLDWIDE = /\b(anywhere|worldwide|any country|all countries|globally|in the world)\b/i;

const STRONG_LINK =
  /where we hire|where we'?re hiring|countries we hire|hiring locations|locations we hire|where (?:can|do) (?:you|we) (?:work|live)|work from anywhere|remote[- ](?:work[- ])?policy|remote[- ]first|country[- ]hiring|hiring[- ]countries|employment[- ]solutions|entities/i;
const MEDIUM_LINK =
  /\bremote\b|\blocations?\b|\bhiring\b|\bcountr(?:y|ies)\b|\bdistributed\b|\banywhere\b/i;
const HANDBOOK_LINK = /handbook/i;
const NAV_LINK = /\bcareers?\b|\bjobs\b|\bjoin\b|work with us|open (?:roles|positions)/i;
/** Paths of careers, hiring-policy and handbook sections. */
const CAREERS_PATH =
  /\/(?:careers?|jobs?|join\w*|hiring|work-with-us|working-at\w*|handbook|remote\w*|people\w*|culture|life-at\w*|about|company|team)(?:[/-]|$)/i;
const CAREERS_HOST = /^(?:careers|jobs|handbook|about|people|work|join)\./i;
/** Sections that talk about hiring in general rather than this company's policy. */
const NOISE_PATH =
  /\/(?:blog|news|articles?|press|customers?|case-studies|events?|webinars?|podcasts?|docs|legal\/privacy|blob|tree|edit|raw)(?:\/|$)/i;
const NOISE_HOST =
  /^(?:blog|articles|news|docs|help|support|status|community|app|dashboard|api)\./i;
const ASSET_PATH = /\.(?:pdf|png|jpe?g|gif|svg|webp|zip|xml|json|css|js|mp4|ico)$/i;

export interface DiscoverInput {
  domain: string;
  /** Known URLs (careers page, website); only those on the company's domain are fetched. */
  hintUrls?: ReadonlyArray<string | null | undefined>;
}

export interface DiscoveredPage {
  url: string;
  fetchedAt: Date;
  /** Whitespace as htmlToText produced it; quotes are verified against this. */
  text: string;
  /** `text` with job-listing lines blanked; a quote must appear here to count as policy. */
  policyText: string;
  /** The hiring-location passages sent to the model (taken from `policyText`). */
  excerpt: string;
}

export interface DiscoveryAttempt {
  requestedUrl: string;
  url: string;
  outcome:
    "relevant" | "irrelevant" | "job-detail" | Extract<PageFetchResult, { ok: false }>["reason"];
  status?: number;
}

export interface DiscoveryResult {
  domain: string;
  /** Pages kept for extraction, most relevant first. */
  pages: DiscoveredPage[];
  attempts: DiscoveryAttempt[];
  /** Every attempt failed on the network, a timeout, a 5xx or an unreachable robots.txt. */
  fetchFailed: boolean;
  requests: number;
}

/** "https://www.Example.com/x" or "www.example.com" becomes "example.com". */
export function normalizeDomain(domain: string): string {
  let value = domain.trim().toLowerCase();
  value = value
    .replace(/^[a-z]+:\/\//, "")
    .replace(/[/?#].*$/, "")
    .replace(/:\d+$/, "");
  return value.replace(/^www\./, "").replace(/\.$/, "");
}

/** The company's domain and its subdomains (www, about, handbook). */
export function hostMatchesDomain(host: string, domain: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, "");
  return h === domain || h.endsWith(`.${domain}`);
}

/** The new domain when `to` is the same path on another domain (a whole-site redirect). */
function movedDomain(from: string, to: string): string | null {
  try {
    const a = new URL(from);
    const b = new URL(to);
    const path = (u: URL) => u.pathname.replace(/\/+$/, "") || "/";
    if (path(a) !== path(b)) return null;
    const source = normalizeDomain(a.hostname);
    const target = normalizeDomain(b.hostname);
    if (unsafeUrlReason(b) || hostMatchesDomain(b.hostname, source)) return null;
    // Only a move to another registrable domain with the same name (helpscout.net to
    // helpscout.com, example.de to example.com); anything else is not the company's own site.
    if (target !== registrableDomain(target)) return null;
    if (registrableName(target) !== registrableName(source)) return null;
    return target;
  } catch {
    return null;
  }
}

function canonical(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    const host = u.hostname.replace(/^www\./, "");
    const path = u.pathname.replace(/\/+$/, "") || "/";
    return `${host}${path}${u.search}`;
  } catch {
    return url;
  }
}

interface Link {
  url: string;
  score: number;
  fromHomepage?: boolean;
}

function stripTags(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function scoreLink(anchor: string, url: URL): number {
  let path = url.pathname;
  try {
    path = decodeURIComponent(path);
  } catch {
    // Malformed escapes: score the raw path.
  }
  path = path.replace(/[-_/]+/g, " ");
  const both = `${anchor} ${path}`;
  if (STRONG_LINK.test(both) || STRONG_LINK.test(url.pathname)) return 4;
  if (HANDBOOK_LINK.test(both)) {
    // Handbooks link hundreds of pages: hiring and employment first, remote-work guides after.
    if (/hir(?:e|ing)|employment|countr|entit|contractor|where/i.test(both)) return 3;
    return /remote|location/i.test(both) ? 2 : 1;
  }
  if (JOB_DETAIL_PATH.test(url.pathname)) return 0;
  if (MEDIUM_LINK.test(both)) return 2;
  if (NAV_LINK.test(both)) return 1;
  return 0;
}

/** Links on `html` worth following, best first. */
export function extractLinks(
  html: string,
  baseUrl: string,
  isAllowedHost: (host: string) => boolean,
): Link[] {
  const found = new Map<string, Link>();
  const re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(re)) {
    const attrs = match[1] ?? "";
    const href = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attrs);
    const raw = href?.[1] ?? href?.[2] ?? href?.[3];
    if (!raw || /^(?:mailto|tel|javascript):/i.test(raw) || raw.startsWith("#")) continue;
    // Script fragments inside attributes ("'+location.href+'") are not links.
    if (/['"+\s]/.test(raw.trim())) continue;
    let url: URL;
    try {
      url = new URL(decodeHtmlEntities(raw), baseUrl);
    } catch {
      continue;
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") continue;
    if (!isAllowedHost(url.hostname) || ASSET_PATH.test(url.pathname)) continue;
    if (
      NOISE_HOST.test(url.hostname) ||
      NOISE_PATH.test(url.pathname) ||
      JOB_QUERY.test(url.search)
    ) {
      continue;
    }
    url.hash = "";
    const anchor = stripTags(match[2] ?? "");
    if (anchor.length > 80) continue;
    const score = scoreLink(anchor, url);
    if (score === 0) continue;
    const key = canonical(url.href);
    const prior = found.get(key);
    if (!prior || prior.score < score) found.set(key, { url: url.href, score });
  }
  return [...found.values()].sort((a, b) => b.score - a.score);
}

/** The hiring-location passages of a page: each matching line with a little context. */
export function hiringExcerpt(text: string, maxChars = MAX_EXCERPT_CHARS_PER_PAGE): string {
  const lines = text.split("\n");
  const keep = new Array<boolean>(lines.length).fill(false);
  lines.forEach((line, i) => {
    if (!HIRING_LINE.test(line)) return;
    // Headings are often followed by a list of countries.
    for (let j = Math.max(0, i - 2); j <= Math.min(lines.length - 1, i + 6); j++) keep[j] = true;
  });
  // A country list or table runs on past the window: keep following lines that name places.
  for (let i = 1; i < lines.length; i++) {
    if (keep[i] || !keep[i - 1]) continue;
    const line = lines[i] ?? "";
    if (line.trim() !== "" && findPlaceMentions(line).length > 0) keep[i] = true;
  }
  const parts: string[] = [];
  let length = 0;
  let gap = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (!keep[i]) {
      gap = parts.length > 0;
      continue;
    }
    if (line.trim() === "") continue;
    const piece = gap ? `[...]\n${line}` : line;
    if (length + piece.length + 1 > maxChars) break;
    parts.push(piece);
    length += piece.length + 1;
    gap = false;
  }
  return parts.join("\n");
}

const HIRING_TEXT =
  /where we hire|hire (?:in|from)|hiring (?:in|from)|we (?:can|cannot|can't|don't|do not|are (?:not )?able to) (?:hire|employ)|countries|anywhere|worldwide|employer of record|legal entit(?:y|ies)|contractors?/gi;

/** How much a page says about where the company hires: phrase hits, capped. */
export function hiringTextScore(text: string): number {
  return Math.min(10, text.match(HIRING_TEXT)?.length ?? 0);
}

/** The element starting at `openIndex` (its tag name `tag`), up to its matching close tag. */
function elementAt(html: string, openIndex: number, tag: string): string | null {
  const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, "gi");
  re.lastIndex = openIndex;
  let depth = 0;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    if (m[0].endsWith("/>")) continue;
    depth += m[1] ? -1 : 1;
    if (depth === 0) return html.slice(openIndex, m.index + m[0].length);
  }
  return null;
}

/** Below this much markup a `<main>` is a client-side shell, not the page's content. */
const MIN_MAIN_CHARS = 2_000;

/**
 * The page's main content: `<main>`, else the element with role="main", else a lone `<article>`.
 * Handbook and docs pages carry megabytes of sidebar before it. Falls back to the whole page.
 */
export function mainContent(html: string): string {
  const candidates: Array<string | null> = [];
  const main = /<main\b[^>]*>/i.exec(html);
  if (main) candidates.push(elementAt(html, main.index, "main"));
  const role = /<([a-z][a-z0-9]*)\b[^>]*\brole\s*=\s*["']?main\b[^>]*>/i.exec(html);
  if (role?.[1]) candidates.push(elementAt(html, role.index, role[1]));
  const articles = [...html.matchAll(/<article\b[^>]*>/gi)];
  if (articles.length === 1 && articles[0]) {
    candidates.push(elementAt(html, articles[0].index, "article"));
  }
  return candidates.find((c): c is string => c !== null && c.length >= MIN_MAIN_CHARS) ?? html;
}

/** Links to single roles (job pages, hosted applicant-tracking pages), with the text inside them. */
function stripJobLinks(html: string, baseUrl: string): string {
  return html.replace(/<a\b([^>]*)>[\s\S]*?<\/a>/gi, (whole, attrs: string) => {
    const href = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attrs);
    const raw = href?.[1] ?? href?.[2] ?? href?.[3];
    if (!raw) return whole;
    try {
      return isJobDetailUrl(new URL(decodeHtmlEntities(raw), baseUrl)) ? " " : whole;
    } catch {
      return whole;
    }
  });
}

/**
 * Page text from the main content, without scripts, forms, dropdowns, navigation, footers and links
 * to single roles: a country `<select>` on an application form, a site-wide menu or a job card is
 * not a statement about hiring. Main content is taken before the size cap.
 */
export function pageText(html: string, baseUrl: string): string {
  const main = mainContent(html).slice(0, COMPANY_PAGE_MAX_BYTES);
  const stripped = main.replace(
    /<(script|style|noscript|template|svg|select|datalist|form|nav|footer|aside)\b[\s\S]*?<\/\1\s*>/gi,
    " ",
  );
  return htmlToText(stripJobLinks(stripped, baseUrl));
}

/**
 * A page worth sending: it names hiring locations or says "worldwide", and either sits in a
 * careers-like section or uses hiring-policy wording (a product page mentioning "remote replicas"
 * in "other countries" does not).
 */
export function isHiringPage(text: string, url?: URL): boolean {
  if (!HIRING_PAGE.test(text)) return false;
  if (!WORLDWIDE.test(text) && findPlaceMentions(text).length === 0) return false;
  if (!url) return true;
  return (
    CAREERS_PATH.test(url.pathname) || CAREERS_HOST.test(url.hostname) || hasPolicyLanguage(text)
  );
}

export interface DiscoverOptions {
  fetcher?: PageFetcher;
  signal?: AbortSignal;
  transport?: Transport;
  lookup?: HostLookup;
}

export async function discoverCompanyPages(
  input: DiscoverInput,
  options: DiscoverOptions = {},
): Promise<DiscoveryResult> {
  const domain = normalizeDomain(input.domain);
  // A company domain that redirects wholesale to another domain (helpscout.net to helpscout.com)
  // adds that domain once; nothing else off the company's domain is read.
  const domains = [domain];
  const isAllowedHost = (host: string) => domains.some((d) => hostMatchesDomain(host, d));
  const fetcher =
    options.fetcher ??
    createPageFetcher({
      isAllowedHost,
      ...(options.signal ? { signal: options.signal } : {}),
      ...(options.transport ? { transport: options.transport } : {}),
      ...(options.lookup ? { lookup: options.lookup } : {}),
    });

  const hints: string[] = [];
  for (const hint of input.hintUrls ?? []) {
    if (!hint) continue;
    try {
      if (hostMatchesDomain(new URL(hint).hostname, domain)) hints.push(hint);
    } catch {
      // Not a URL; ignore.
    }
  }
  const primary = [...hints, ...PRIMARY_PATHS.map((path) => `https://${domain}${path}`)];
  const secondary = SECONDARY_PATHS.map((path) => `https://${domain}${path}`);

  const seen = new Set<string>();
  const links: Link[] = [];
  const attempts: DiscoveryAttempt[] = [];
  const kept: Array<DiscoveredPage & { rank: number }> = [];
  let okPages = 0;
  let homepageTried = false;

  // Order: the main careers paths, then strong hiring-location links found so far, then the
  // homepage (only while nothing relevant was found) and the careers links it leads to, then the
  // other candidate paths, then weak links.
  const nextUrl = (): { url: string; score: number; homepage?: boolean } | null => {
    const unseen = (url: string) => !seen.has(canonical(url));
    const first = primary.find(unseen);
    if (first) return { url: first, score: 1 };
    links.sort((a, b) => b.score - a.score);
    const strong = links.find((l) => l.score >= 2 && unseen(l.url));
    if (strong) return strong;
    if (kept.length === 0 && !homepageTried) {
      homepageTried = true;
      return { url: `https://${domain}/`, score: 0, homepage: true };
    }
    const nav = links.find((l) => l.score === 1 && l.fromHomepage && unseen(l.url));
    if (nav) return nav;
    // Once a hiring page is found, the guessed paths are not worth their requests.
    if (kept.length > 0) return null;
    const candidate = secondary.find(unseen);
    if (candidate) return { url: candidate, score: 1 };
    const weak = links.find((l) => unseen(l.url));
    return weak ?? null;
  };

  while (okPages < MAX_PAGES_PER_COMPANY && attempts.length < MAX_ATTEMPTS_PER_COMPANY) {
    const next = nextUrl();
    if (!next) break;
    seen.add(canonical(next.url));
    const result = await fetcher.get(next.url);
    if (!result.ok && result.reason === "off-domain" && domains.length === 1) {
      const moved = movedDomain(result.requestedUrl, result.url);
      if (moved) {
        domains.push(moved);
        attempts.push({
          requestedUrl: result.requestedUrl,
          url: result.url,
          outcome: "off-domain",
        });
        // Retry the same URL: the redirect now lands on an allowed host.
        seen.delete(canonical(next.url));
        continue;
      }
    }
    if (!result.ok) {
      seen.add(canonical(result.url));
      attempts.push({
        requestedUrl: result.requestedUrl,
        url: result.url,
        outcome: result.reason,
        ...(result.status === undefined ? {} : { status: result.status }),
      });
      continue;
    }
    const finalKey = canonical(result.url);
    const duplicate = finalKey !== canonical(next.url) && seen.has(finalKey);
    seen.add(finalKey);
    if (duplicate) {
      attempts.push({ requestedUrl: result.requestedUrl, url: result.url, outcome: "irrelevant" });
      continue;
    }
    okPages += 1;

    for (const link of extractLinks(result.html, result.url, isAllowedHost)) {
      if (seen.has(canonical(link.url))) continue;
      // The homepage only leads to the careers page; its other links are rarely hiring pages.
      links.push(
        next.homepage
          ? { url: link.url, score: Math.min(link.score, 1), fromHomepage: true }
          : link,
      );
    }

    const text = pageText(result.html, result.url);
    const finalUrl = new URL(result.url);
    if (isJobDetailPage(finalUrl, text)) {
      attempts.push({ requestedUrl: result.requestedUrl, url: result.url, outcome: "job-detail" });
      continue;
    }
    const policyText = withoutJobListings(text);
    const relevant =
      !next.homepage &&
      !NOISE_PATH.test(finalUrl.pathname) &&
      !NOISE_HOST.test(finalUrl.hostname) &&
      isHiringPage(policyText, finalUrl);
    attempts.push({
      requestedUrl: result.requestedUrl,
      url: result.url,
      outcome: relevant ? "relevant" : "irrelevant",
    });
    if (!relevant) continue;
    const excerpt = hiringExcerpt(policyText);
    // Client-rendered sites serve the same shell on several paths: keep one copy.
    if (excerpt === "" || kept.some((k) => k.excerpt === excerpt)) continue;
    kept.push({
      url: result.url,
      fetchedAt: result.fetchedAt,
      text,
      policyText,
      excerpt,
      rank: hiringTextScore(policyText) + next.score,
    });
  }

  // Pages saying most about where the company hires first; stay under the total budget.
  kept.sort((a, b) => b.rank - a.rank);
  const pages: DiscoveredPage[] = [];
  let total = 0;
  for (const { rank: _rank, ...page } of kept) {
    if (total + page.excerpt.length > MAX_EXCERPT_CHARS_TOTAL) {
      const room = MAX_EXCERPT_CHARS_TOTAL - total;
      if (room < 1_000) break;
      page.excerpt = page.excerpt.slice(0, room);
    }
    total += page.excerpt.length;
    pages.push(page);
  }

  const fetchFailed =
    okPages === 0 &&
    attempts.length > 0 &&
    attempts.every(
      (a) =>
        a.outcome === "network" ||
        a.outcome === "timeout" ||
        a.outcome === "robots-unreachable" ||
        (a.outcome === "http" && (a.status ?? 0) >= 500),
    );

  return { domain, pages, attempts, fetchFailed, requests: fetcher.requests };
}
