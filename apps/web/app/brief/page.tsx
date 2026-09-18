import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import { forbidden, redirect } from "next/navigation";
import { loadBrief } from "@/app/api/brief/_lib/db";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { getProductAccess } from "@/lib/auth/session";
import { BriefClient } from "./brief-client";
import styles from "./brief.module.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Brief.meta");
  return { title: t("title"), robots: { index: false, follow: false } };
}

/**
 * `/brief` — the page the product was pointing at all along: the roles that can hire you, and, on
 * the days there are none, what came closest and the one tap that would open it (PLAN D6, D7).
 *
 * Server shell then client component, like `/profile`: the first paint is the real Brief, read on
 * the server, and `useBrief` takes it from there. The proxy filters product routes first; the
 * access check here is the authoritative one.
 */
export default async function BriefPage() {
  const access = await getProductAccess(await headers());
  if (access.status === "unauthenticated") redirect("/sign-in");
  if (access.status === "forbidden") forbidden();

  const brief = await loadBrief(access.session.user.id);

  return (
    <div className={styles.page}>
      <SiteHeader />
      <main className={styles.shell}>
        <BriefClient initial={brief} />
      </main>
      <SiteFooter />
    </div>
  );
}
