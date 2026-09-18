"use client";

// The browser half of web push (PLAN D8): what this browser can do, and the two calls that turn a
// subscription on and off. No React, no network — the route calls live in `api.ts`.

import type { PushSubscriptionBody } from "@/app/api/channels/_lib/view";

/**
 * What this browser can do about push, decided once on mount.
 *
 * - `ready` — the Push API is here and permission has not been refused.
 * - `home-screen` — **iOS and iPadOS.** Safari 16.4 added the Push API, but only for a web app
 *   saved to the Home Screen (MDN browser-compat `PushManager.safari_ios`); in an ordinary tab
 *   `PushManager` simply is not there. The page has to say so. Offering a switch that a person can
 *   turn on and that then silently never fires is the worst of the three outcomes.
 * - `denied` — notifications are blocked for this site. Only the browser's own settings can undo
 *   it, so the page says where rather than offering a switch that cannot work.
 * - `unsupported` — no service worker, no `PushManager`, or no `Notification`.
 */
export type PushAvailability = "ready" | "home-screen" | "denied" | "unsupported";

/**
 * iOS and iPadOS, including an iPad reporting itself as a Mac.
 *
 * `navigator.platform` is deprecated and iPadOS answers "MacIntel", so the touch-point count is
 * what separates an iPad from a desktop Safari. Used only to choose which sentence to show.
 */
function isAppleMobile(): boolean {
  if (/iphone|ipad|ipod/i.test(navigator.userAgent)) return true;
  return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
}

/** True when the page is running as an installed app rather than in a browser tab. */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return iosStandalone || window.matchMedia("(display-mode: standalone)").matches;
}

export function pushAvailability(): PushAvailability {
  if (typeof window === "undefined") return "unsupported";
  const hasApi =
    "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (!hasApi) return isAppleMobile() && !isStandalone() ? "home-screen" : "unsupported";
  if (Notification.permission === "denied") return "denied";
  return "ready";
}

/**
 * The VAPID public key as the Push API wants it.
 *
 * `applicationServerKey` accepts a base64url string in the current spec, but Safari has wanted a
 * `BufferSource` for as long as it has had the API, and decoding here costs nothing.
 */
function applicationServerKey(base64url: string): Uint8Array<ArrayBuffer> {
  const padded = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, "="));
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * The worker, registered.
 *
 * `/sw.js` sits at the root of `public/`, so its scope is the whole origin with no
 * `Service-Worker-Allowed` header. Registration is idempotent; calling it again returns the
 * existing worker.
 */
async function registration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration("/");
  return existing ?? navigator.serviceWorker.register("/sw.js", { scope: "/" });
}

/**
 * The same reduction of an endpoint that the server sends in `push.fingerprints`
 * (`app/api/channels/_lib/db.ts`, `pushFingerprint`): the first 16 hex of its SHA-256.
 *
 * This is how the page knows whether one of the account's push rows is *this* browser without the
 * server ever handing a browser an endpoint. Null when `crypto.subtle` is unavailable — an
 * insecure context, which is also a context where push does not exist — and the caller then treats
 * this browser as unrecognised, which reads as "off" and leaves the switch working.
 */
export async function pushFingerprint(endpoint: string): Promise<string | null> {
  if (typeof crypto === "undefined" || !crypto.subtle) return null;
  try {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(endpoint));
    return [...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("")
      .slice(0, 16);
  } catch {
    return null;
  }
}

/** This browser's subscription, if it already has one, without registering a worker to find out. */
export async function currentSubscription(): Promise<PushSubscriptionBody | null> {
  if (pushAvailability() !== "ready") return null;
  const existing = await navigator.serviceWorker.getRegistration("/");
  const subscription = await existing?.pushManager.getSubscription();
  return subscription ? toBody(subscription) : null;
}

function toBody(subscription: PushSubscription): PushSubscriptionBody | null {
  const json = subscription.toJSON();
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!json.endpoint || !p256dh || !auth) return null;
  return { endpoint: json.endpoint, keys: { p256dh, auth } };
}

/**
 * Ask for permission and subscribe.
 *
 * Null means the browser said no, at whichever step: the permission prompt was dismissed or
 * refused, or the push service would not issue a subscription. The caller turns that into one
 * message; nothing here throws a provider's own text at a person.
 *
 * `userVisibleOnly: true` is not optional in any shipping browser, and it is also the promise this
 * product wants to make: every push it sends shows a notification.
 */
export async function subscribeHere(vapidPublicKey: string): Promise<PushSubscriptionBody | null> {
  if (pushAvailability() !== "ready") return null;

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return null;

  try {
    const worker = await registration();
    const existing = await worker.pushManager.getSubscription();
    const subscription =
      existing ??
      (await worker.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey(vapidPublicKey),
      }));
    return toBody(subscription);
  } catch {
    return null;
  }
}

/**
 * Drop this browser's subscription and report the endpoint it had, so the caller can tell the
 * server which row to forget. Null when there was nothing to drop.
 */
export async function unsubscribeHere(): Promise<string | null> {
  const existing = await navigator.serviceWorker.getRegistration("/");
  const subscription = await existing?.pushManager.getSubscription();
  if (!subscription) return null;
  const { endpoint } = subscription;
  await subscription.unsubscribe().catch(() => false);
  return endpoint;
}

/**
 * Throw this browser's subscription away and get a different one.
 *
 * For the one case the server refuses: the endpoint the platform handed back is already another
 * account's row. That happens on a shared browser, where a `PushSubscription` outlives the sign-out
 * of the person who created it — it is a fact about the browser and the origin, with no account in
 * it. Unsubscribing and subscribing again mints a **new** endpoint, which belongs to nobody, and
 * leaves the old one answering 410 so the dispatcher retires the other account's row by itself.
 */
export async function resubscribeHere(
  vapidPublicKey: string,
): Promise<PushSubscriptionBody | null> {
  await unsubscribeHere();
  return subscribeHere(vapidPublicKey);
}
