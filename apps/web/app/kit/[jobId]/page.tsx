import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import { forbidden, notFound, redirect } from "next/navigation";
import { loadKitPage } from "@/app/api/kit/_lib/generate";
import { isUuid } from "@/app/api/kit/_lib/http";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { getProductAccess } from "@/lib/auth/session";
import { KitClient } from "./kit-client";
import styles from "../kit.module.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Kit.meta");
  return { title: t("title"), robots: { index: false, follow: false } };
}

/** A cover letter written about one person: read at request time, cached by nobody. */
export const dynamic = "force-dynamic";

/**
 * `/kit/[jobId]` — the application kit for one post (PLAN D9).
 *
 * Server shell then client component, like `/brief`, `/profile` and `/settings`: the first paint is
 * the real state of this kit, read on the server, and `useKit` takes it from there. The proxy
 * filters product routes first; the access check here is the authoritative one.
 *
 * `notFound()` for a post that is closed, merged or does not exist — which is also the answer to a
 * guessed id, so a stranger cannot tell one from the other.
 */
export default async function KitPage({ params }: { params: Promise<{ jobId: string }> }) {
  const access = await getProductAccess(await headers());
  if (access.status === "unauthenticated") redirect("/sign-in");
  if (access.status === "forbidden") forbidden();

  const { jobId } = await params;
  if (!isUuid(jobId)) notFound();

  const page = await loadKitPage(access.session.user.id, jobId, new Date());
  if (!page) notFound();

  return (
    <div className={styles.page}>
      <SiteHeader />
      <main className={styles.shell}>
        <KitClient initial={page} />
      </main>
      <SiteFooter />
    </div>
  );
}
