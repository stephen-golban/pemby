import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import { forbidden, redirect } from "next/navigation";
import { loadAdminView } from "@/app/api/admin/_lib/db";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { getOwnerAccess } from "@/lib/access/owner";
import { AdminClient } from "./admin-client";
import styles from "./admin.module.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Admin.meta");
  return { title: t("title"), robots: { index: false, follow: false } };
}

/**
 * `/admin` — the owner's view of what is in the database (PLAN D18, D26).
 *
 * **`getOwnerAccess`, not `getProductAccess`.** Every other product page is content with
 * `getProductAccess` because every other product page answers with the caller's own rows. This one
 * answers with other people's flags, other people's jobs and Pemby's own spend, and
 * `getProductAccess` consults the owner allowlist **only when `ownerGateEnabled()` is true** —
 * which on staging, with no `OWNER_GATE` variable and open sign-up, it is not. Behind
 * `getProductAccess` this page would be readable today by anyone who signed themselves up, and in
 * production the day sign-up opens. `getOwnerAccess` asks the allowlist question unconditionally.
 *
 * The proxy filters routes first and `isAdminRoute` keeps this path out of every exemption list,
 * but the proxy's own owner gate is inert wherever `ownerGateEnabled()` is false. This check is the
 * authoritative one, and so is the matching one in every `/api/admin` route handler: a screenshot
 * of the page proves nothing about who else can open it.
 */
export default async function AdminPage() {
  const access = await getOwnerAccess(await headers());
  if (access.status === "unauthenticated") redirect("/sign-in");
  if (access.status === "forbidden") forbidden();

  const view = await loadAdminView();

  return (
    <div className={styles.page}>
      <SiteHeader />
      <main className={styles.shell}>
        <AdminClient initial={view} />
      </main>
      <SiteFooter />
    </div>
  );
}
