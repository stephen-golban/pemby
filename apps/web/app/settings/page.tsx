import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import { forbidden, redirect } from "next/navigation";
import { loadChannelSettings } from "@/app/api/channels/_lib/db";
import { loadKeyView } from "@/app/api/openrouter/_lib/db";
import { isOpenRouterError } from "@/app/api/openrouter/_lib/view";
import type { OpenRouterError } from "@/app/api/openrouter/_lib/view";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { getProductAccess } from "@/lib/auth/session";
import { SettingsClient } from "./settings-client";
import styles from "./settings.module.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Settings.meta");
  return { title: t("title"), robots: { index: false, follow: false } };
}

/**
 * `/settings` — how matches reach you, when they arrive, and what pays for your kits.
 *
 * The page was "Delivery" until phase 09, and the framing was widened deliberately rather than
 * stretched: an OpenRouter key is not a delivery channel, and filing it under a page named after
 * one would have been the first small lie in a feature whose whole job is to be exact about what
 * Pemby can and cannot do with somebody else's credential. The specificity moved down one level,
 * into the section headings, where "Channels", "When" and "Your own AI key" each say what they are.
 *
 * Server shell then client component, like `/brief` and `/profile`: the first paint is the real
 * state of the account, read on the server, and the hooks take it from there. The proxy filters
 * product routes first; the access check here is the authoritative one.
 */
export default async function SettingsPage({
  searchParams,
}: {
  /**
   * `?openrouter=<code>` is how the OAuth callback reports what happened — it returns as a
   * navigation, so the outcome has to survive a redirect. Read here rather than with
   * `useSearchParams` so the first paint already carries it and the client needs no Suspense
   * boundary for a value the server is holding anyway.
   */
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const access = await getProductAccess(await headers());
  if (access.status === "unauthenticated") redirect("/sign-in");
  if (access.status === "forbidden") forbidden();

  const anonymous = access.session.user.isAnonymous === true;
  // Read at request time rather than relying on the build-time inline, so a deployment that sets
  // the key after a build still offers push. Only the public half ever reaches the browser; the
  // private key belongs to the dispatcher and is never in this process.
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() || null;

  const settings = anonymous ? null : await loadChannelSettings(access.session.user.id);
  // `loadKeyView` is built on `selectUserAiKeyStatus`, which does not select the ciphertext column,
  // so nothing that reaches this page's props can be a key.
  const openRouter = anonymous ? null : await loadKeyView(access.session.user.id);

  const outcome = (await searchParams).openrouter;
  const openRouterOutcome =
    typeof outcome === "string" && (outcome === "connected" || isOpenRouterError(outcome))
      ? (outcome as OpenRouterError | "connected")
      : null;

  return (
    <div className={styles.page}>
      <SiteHeader />
      <main className={styles.shell}>
        <SettingsClient
          initial={settings}
          openRouter={openRouter}
          openRouterOutcome={openRouterOutcome}
          accountEmail={access.session.user.email}
          vapidPublicKey={vapidPublicKey}
        />
      </main>
      <SiteFooter />
    </div>
  );
}
