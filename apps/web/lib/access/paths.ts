// Route classification for staging protection and the owner-only gate (phase 01 items 7 and 12).
// Pure functions, shared by `proxy.ts` and server-side checks.

function under(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/**
 * The static files a PWA install and a push subscription need before anyone is signed in
 * (phase 08, PLAN D8).
 *
 * `/sw.js` is the one that has to be here. A service worker script is fetched by the browser, not
 * by the page: the request carries no way to answer a challenge or a redirect, and a 401 or a
 * rewrite to `/access-denied` does not fail loudly — `navigator.serviceWorker.register()` simply
 * rejects, or worse, registers HTML as a worker. Push then never arrives and nothing on screen
 * says why. The manifest and its icons are the same class of request, made by the browser chrome
 * rather than by application code.
 *
 * None of these files carries anything private: a worker with no cache, a name, a theme colour and
 * a letter P on an olive square.
 */
const PWA_FILES = new Set([
  "/sw.js",
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable-512.png",
]);

/**
 * Routes that verify their own callers (signatures, secret tokens), must answer health checks, or
 * are fetched by the browser itself with no way to carry credentials (`PWA_FILES`).
 *
 * `isPublicRoute` delegates to this, so a path named here clears both the staging password and the
 * owner-only gate. That is the whole point for the three email-link routes (phase 08): they are
 * reached from inside a message Pemby sent, by someone who is not signed in — and `POST
 * /api/unsubscribe` is reached by a mailbox provider's one-click agent (RFC 8058), which carries no
 * credentials and cannot be asked for any. A 401 there is a one-click unsubscribe that silently
 * fails, which is how a sending domain gets its reputation ruined. None of the three does anything
 * before `verifyEmailLinkToken` accepts an HMAC-signed token, and `GET /api/unsubscribe` answers
 * 405 — the writes are POST-only, so a link scanner cannot unsubscribe anyone by following it.
 */
export function isStagingAuthExempt(pathname: string): boolean {
  return (
    under(pathname, "/api/webhooks") ||
    under(pathname, "/api/auth") ||
    under(pathname, "/api/unsubscribe") ||
    under(pathname, "/api/flag-from-email") ||
    under(pathname, "/unsubscribe") ||
    pathname === "/api/health" ||
    PWA_FILES.has(pathname)
  );
}

const SEO_FILES = new Set(["/robots.txt", "/sitemap.xml", "/favicon.ico"]);

/**
 * Metadata image routes Next.js generates at the app root: `/icon`, `/icon.png`, `/icon1.png`,
 * and the same for apple-icon, opengraph-image and twitter-image (Next adds a `?<hash>` query, not
 * part of the pathname). Nothing else under these names, so `/icons` or `/iconsets` stay product
 * routes. Metadata images of nested public pages are covered by their page's prefix.
 */
const METADATA_IMAGE =
  /^\/(?:icon|apple-icon|opengraph-image|twitter-image)\d*(?:\.(?:png|jpe?g|gif|svg|ico|webp))?$/i;

/**
 * Public while the owner-only gate is on: landing, pricing, the legal pages (and the `/legal/*`
 * paths that redirect to them), SEO files, the PWA files, sign-in, sign-up and email verification,
 * auth endpoints and callbacks, the anonymous CV drop and teaser APIs (phase 06: they check their
 * own session and are 404 when the drop is off), webhooks, health, and Next.js assets. Everything
 * else is a product route.
 */
export function isPublicRoute(pathname: string): boolean {
  return (
    pathname === "/" ||
    under(pathname, "/pricing") ||
    under(pathname, "/terms") ||
    under(pathname, "/privacy") ||
    under(pathname, "/refunds") ||
    under(pathname, "/legal") ||
    under(pathname, "/sign-in") ||
    under(pathname, "/sign-up") ||
    under(pathname, "/verify-email") ||
    under(pathname, "/api/cv") ||
    under(pathname, "/api/teaser") ||
    pathname === "/access-denied" ||
    isStagingAuthExempt(pathname) ||
    under(pathname, "/_next") ||
    SEO_FILES.has(pathname) ||
    PWA_FILES.has(pathname) ||
    METADATA_IMAGE.test(pathname)
  );
}

export function isApiRoute(pathname: string): boolean {
  return under(pathname, "/api");
}
