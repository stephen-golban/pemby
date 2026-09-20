import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import { forbidden, redirect } from "next/navigation";
import { loadTracker } from "@/app/api/applications/_lib/db";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { getProductAccess } from "@/lib/auth/session";
import { TrackerClient } from "./tracker-client";
import styles from "./tracker.module.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Tracker.meta");
  return { title: t("title"), robots: { index: false, follow: false } };
}

/**
 * `/tracker` — the application tracker (PLAN D9).
 *
 * Server shell then client component, like `/brief` and `/profile`: the first paint is the real
 * board, read on the server, and `useTracker` takes it from there. The proxy filters product routes
 * first; the access check here is the authoritative one.
 */
export default async function TrackerPage() {
  const access = await getProductAccess(await headers());
  if (access.status === "unauthenticated") redirect("/sign-in");
  if (access.status === "forbidden") forbidden();

  const tracker = await loadTracker(access.session.user.id);

  return (
    <div className={styles.page}>
      <SiteHeader />
      <main className={styles.shell}>
        <TrackerClient initial={tracker} />
      </main>
      <SiteFooter />
    </div>
  );
}
