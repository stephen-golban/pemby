/*
 * Pemby's service worker: the web-push half of PLAN D8, and nothing else.
 *
 * It is deliberately not a cache. Every screen this product has is someone's own private data read
 * from the server, so an offline copy would be a copy of a Brief sitting in a shared browser, and
 * a stale one is worse than an error page. The `fetch` listener below intercepts nothing; it exists
 * because a browser will not treat a site as installable without one.
 *
 * Served from `/sw.js`, so its scope is the whole origin without a `Service-Worker-Allowed`
 * header — that header is only needed to claim a scope *above* the script's own directory, which
 * is exactly why the file is at the root of `public/` rather than under a folder.
 *
 * Plain JavaScript, no build step, no imports. `apps/web/global.d.ts` types the app, not this file;
 * it runs in a worker realm where `self` is a `ServiceWorkerGlobalScope` and none of the app's
 * modules exist.
 *
 * **Privacy.** A push payload carries a job title and a company name — personal in context, because
 * it is a match made for one person. Nothing here is logged, on any path, including errors.
 */

/**
 * The payload the dispatcher sends, JSON, all fields optional:
 *
 *   { "title": string, "body": string, "url": string, "tag": string }
 *
 * `title` and `body` arrive already rendered by `@pemby/core`'s delivery kernel — the same strings
 * table the bot and the email use — because a service worker cannot reach next-intl. `url` is a
 * path on this origin; `tag` is the match id, so a re-send replaces its own notification rather
 * than stacking a second copy of one job.
 */

const DEFAULT_URL = "/brief";
/** The brand name, which is the same in every language, so no copy is stranded outside i18n. */
const FALLBACK_TITLE = "Pemby";

const NOTIFICATION_ICON = "/icon-192.png";
const NOTIFICATION_BADGE = "/icon-192.png";

self.addEventListener("install", () => {
  // No cache to warm, so there is nothing to wait for: take over from the previous worker at once
  // rather than leaving an old push handler live until every tab is closed.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Required for installability; deliberately transparent. Not calling `respondWith` leaves the
// request to the network exactly as if this listener were absent.
self.addEventListener("fetch", () => {});

/** Same-origin paths only: a payload must not be able to point a notification somewhere else. */
function safePath(value) {
  if (typeof value !== "string" || value.length === 0) return DEFAULT_URL;
  try {
    const url = new URL(value, self.location.origin);
    return url.origin === self.location.origin ? url.pathname + url.search : DEFAULT_URL;
  } catch {
    return DEFAULT_URL;
  }
}

function readPayload(event) {
  if (!event.data) return {};
  try {
    const parsed = event.data.json();
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    // A payload that is not JSON is a bug on the sending side, not something to show a person.
    return {};
  }
}

self.addEventListener("push", (event) => {
  const payload = readPayload(event);
  const url = safePath(payload.url);
  const title = typeof payload.title === "string" && payload.title ? payload.title : FALLBACK_TITLE;

  const options = {
    body: typeof payload.body === "string" ? payload.body : undefined,
    icon: NOTIFICATION_ICON,
    badge: NOTIFICATION_BADGE,
    // The match id: a redelivery replaces its own notification instead of stacking a second copy.
    tag: typeof payload.tag === "string" ? payload.tag : undefined,
    data: { url },
    // The point of this channel is that a match arrives while the browser is closed. Leaving it on
    // screen until it is acted on is the whole reason to prefer it over an email.
    requireInteraction: true,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = safePath(event.notification.data && event.notification.data.url);

  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      // Reuse a tab that is already on this origin rather than opening a third copy of the Brief.
      for (const client of clients) {
        if (new URL(client.url).origin !== self.location.origin) continue;
        await client.focus();
        if ("navigate" in client) await client.navigate(target);
        return;
      }
      await self.clients.openWindow(target);
    })(),
  );
});

/**
 * Endpoint rotation.
 *
 * A push service may retire a subscription at any time and tell the worker instead of the page.
 * Without this the account keeps a row the dispatcher will send to for ever and the person simply
 * stops hearing anything, with nothing on screen to say so.
 *
 * Support is uneven (Chromium fires it; Safari and Firefox do not, reliably), so the settings page
 * carries the other half of the repair: it re-posts whatever subscription the browser actually has
 * whenever the server says it has none.
 */
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      const old = event.oldSubscription || (await self.registration.pushManager.getSubscription());
      const key = old && old.options ? old.options.applicationServerKey : null;
      if (!key) return;

      const fresh =
        event.newSubscription ||
        (await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: key,
        }));

      await fetch("/api/channels/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(fresh.toJSON()),
      });
    })().catch(() => {
      // Nothing to report from here: there is no UI, and the endpoint must not reach a log.
    }),
  );
});
