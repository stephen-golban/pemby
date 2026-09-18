import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import { forbidden, redirect } from "next/navigation";
import { loadChannelSettings } from "@/app/api/channels/_lib/db";
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
 * `/settings` — where matches reach you, and when (PLAN D8).
 *
 * Server shell then client component, like `/brief` and `/profile`: the first paint is the real
 * state of the account's channels, read on the server, and `useSettings` takes it from there. The
 * proxy filters product routes first; the access check here is the authoritative one.
 */
export default async function SettingsPage() {
  const access = await getProductAccess(await headers());
  if (access.status === "unauthenticated") redirect("/sign-in");
  if (access.status === "forbidden") forbidden();

  const anonymous = access.session.user.isAnonymous === true;
  // Read at request time rather than relying on the build-time inline, so a deployment that sets
  // the key after a build still offers push. Only the public half ever reaches the browser; the
  // private key belongs to the dispatcher and is never in this process.
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() || null;

  const settings = anonymous ? null : await loadChannelSettings(access.session.user.id);

  return (
    <div className={styles.page}>
      <SiteHeader />
      <main className={styles.shell}>
        <SettingsClient
          initial={settings}
          accountEmail={access.session.user.email}
          vapidPublicKey={vapidPublicKey}
        />
      </main>
      <SiteFooter />
    </div>
  );
}
