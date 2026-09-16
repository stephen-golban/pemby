// Route classification for staging protection and the owner-only gate (phase 01 items 7 and 12).
// Pure functions, shared by `proxy.ts` and server-side checks.

function under(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/** Routes that verify their own callers (signatures, secret tokens) or must answer health checks. */
export function isStagingAuthExempt(pathname: string): boolean {
  return (
    under(pathname, "/api/webhooks") || under(pathname, "/api/auth") || pathname === "/api/health"
  );
}

const SEO_FILES = new Set(["/robots.txt", "/sitemap.xml", "/favicon.ico", "/manifest.webmanifest"]);

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
 * paths that redirect to them), SEO files, sign-in and sign-up,
 * auth endpoints and callbacks, webhooks, health, and Next.js assets. Everything else is a product
 * route.
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
    pathname === "/access-denied" ||
    isStagingAuthExempt(pathname) ||
    under(pathname, "/_next") ||
    SEO_FILES.has(pathname) ||
    METADATA_IMAGE.test(pathname)
  );
}

export function isApiRoute(pathname: string): boolean {
  return under(pathname, "/api");
}
