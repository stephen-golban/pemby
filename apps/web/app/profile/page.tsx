import { COUNTRY_CODES } from "@pemby/core";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import { forbidden, redirect } from "next/navigation";
import { loadProfileView } from "@/app/api/profile/_lib/db";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { getProductAccess } from "@/lib/auth/session";
import { appEnv } from "@/lib/env";
import { ProfileClient } from "./profile-client";
import styles from "./profile.module.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Onboarding.meta");
  return { title: t("profileTitle"), robots: { index: false, follow: false } };
}

/** `/profile` — the profile after onboarding: edit anything, see its strength, export it, delete it. */
export default async function ProfilePage() {
  // Authoritative check; proxy.ts only filters first.
  const access = await getProductAccess(await headers());
  if (access.status === "unauthenticated") redirect("/sign-in");
  if (access.status === "forbidden") forbidden();

  const anonymous = access.session.user.isAnonymous === true;
  const profile = await loadProfileView(access.session.user.id, anonymous);
  const countEnabled = process.env.CV_DROP_ENABLED === "true" && appEnv() !== "production";

  return (
    <div className={styles.page}>
      <SiteHeader />
      <main className={styles.shell}>
        <ProfileClient initial={profile} countryCodes={COUNTRY_CODES} countEnabled={countEnabled} />
      </main>
      <SiteFooter />
    </div>
  );
}
