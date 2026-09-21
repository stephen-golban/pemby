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
import { OnboardingFlow } from "./onboarding-flow";
import styles from "./onboarding.module.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Onboarding.meta");
  return { title: t("title"), robots: { index: false, follow: false } };
}

/**
 * `/onboarding` — the three steps of PLAN D5, where a verified (or still anonymous) visitor turns
 * the profile their CV filled in into a matching profile. `AFTER_VERIFY_PATH` sends people here.
 *
 * The country list is read here rather than in the browser, so `@pemby/core` (zod, the eligibility
 * engine) never reaches the client bundle; names are resolved from the codes with `Intl`.
 */
export default async function OnboardingPage() {
  // Authoritative check; proxy.ts only filters first.
  const access = await getProductAccess(await headers());
  if (access.status === "unauthenticated") redirect("/sign-in");
  if (access.status === "forbidden") forbidden();

  const anonymous = access.session.user.isAnonymous === true;
  const profile = await loadProfileView(access.session.user.id, anonymous);
  // The teaser behind the live count is a phase 06 staging surface (contract, flow step 7).
  const countEnabled = process.env.CV_DROP_ENABLED === "true" && appEnv() !== "production";

  // A signed-in screen navigates between the product's own destinations, not the marketing ones.
  // None is marked current: setup is not one of the four, and claiming one would be a lie.
  const nav = await getTranslations("Brief.nav");
  const destinations = [
    { href: "/brief", label: nav("brief") },
    { href: "/profile", label: nav("profile") },
    { href: "/settings", label: nav("settings") },
    { href: "/pricing", label: nav("passes") },
  ];

  return (
    <div className={styles.page}>
      <SiteHeader nav={destinations} />
      <main className={styles.shell}>
        <OnboardingFlow
          initial={profile}
          countryCodes={COUNTRY_CODES}
          countEnabled={countEnabled}
        />
      </main>
      <SiteFooter />
    </div>
  );
}
