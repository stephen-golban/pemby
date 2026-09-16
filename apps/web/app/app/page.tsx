import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import Link from "next/link";
import { forbidden, redirect } from "next/navigation";
import { SignOutButton } from "@/components/auth-form";
import { DisplayNameForm } from "@/components/display-name-form";
import { getProductAccess } from "@/lib/auth/session";
import { getDisplayName } from "@/lib/profile";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Metadata");
  return { title: t("appTitle"), robots: { index: false, follow: false } };
}

export default async function AppPage() {
  // Authoritative check; proxy.ts only filters first.
  const access = await getProductAccess(await headers());
  if (access.status === "unauthenticated") redirect("/sign-in");
  if (access.status === "forbidden") forbidden();

  const { user } = access.session;
  const t = await getTranslations("App");
  const displayName = await getDisplayName(user.id);

  return (
    <main>
      <h1>{t("heading")}</h1>
      {user.isAnonymous ? (
        <p>
          {t("anonymousSession")} — <Link href="/sign-up">{t("saveAccount")}</Link>
        </p>
      ) : (
        <p>{t("signedInAs", { email: user.email })}</p>
      )}
      <DisplayNameForm initial={{ displayName }} />
      <SignOutButton />
    </main>
  );
}
