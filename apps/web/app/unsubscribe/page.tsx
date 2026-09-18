import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { verifyEmailLinkToken } from "@pemby/core";
import { emailLinkSecret } from "@/app/api/unsubscribe/_lib/secret";
import { UnsubscribeConfirm } from "./unsubscribe-client";
import styles from "./unsubscribe.module.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Delivery.meta");
  return { title: t("unsubscribeTitle"), robots: { index: false, follow: false } };
}

/**
 * `/unsubscribe` — where the "Stop these emails" link in a match email lands.
 *
 * There is no session here and there must not need to be one: the person is in their mail app,
 * possibly on a device that has never signed in. The signed token in the query string is the
 * credential.
 *
 * **This page does not unsubscribe anyone.** It reads the token, which is a pure function, and
 * renders either a button or an expiry notice. The write is a POST to `/api/unsubscribe`, for the
 * reason RFC 8058 gives and that route's header spells out: link scanners and pre-rendering
 * inboxes follow every URL in a message, and a GET that unsubscribed people would be a feature
 * that silences its own users.
 *
 * Nothing on this page names the address. An email address is personal data and does not belong in
 * a page served to whoever holds the link.
 */
export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const raw = params["t"];
  const token = typeof raw === "string" ? raw : "";

  const secret = emailLinkSecret();
  const claims = secret ? verifyEmailLinkToken(secret, token, "unsubscribe", new Date()) : null;
  const t = await getTranslations("Delivery.unsubscribe");

  return (
    <div className={styles.page}>
      <SiteHeader />
      <main className={styles.shell}>
        <div className={styles.card}>
          {claims ? (
            <UnsubscribeConfirm token={token} />
          ) : (
            <>
              <h1 className={styles.title}>{t("expiredTitle")}</h1>
              <p className={styles.lead}>{t("expiredLead")}</p>
              <p className={styles.links}>
                <Link href="/settings">{t("settings")}</Link>
                <Link href="/brief">{t("brief")}</Link>
              </p>
            </>
          )}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
