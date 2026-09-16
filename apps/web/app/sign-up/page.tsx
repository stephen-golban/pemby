import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { connection } from "next/server";
import { AuthForm, ContinueAnonymouslyButton } from "@/components/auth-form";
import { signUpOpen } from "@/lib/auth/codes";
import { appEnv } from "@/lib/env";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Metadata");
  return { title: t("signUpTitle") };
}

export default async function SignUpPage() {
  // Rendered per request: APP_ENV is read at runtime, not at build.
  await connection();
  const t = await getTranslations();
  if (!signUpOpen(appEnv())) {
    return (
      <main>
        <h1>{t("Auth.signUpClosedHeading")}</h1>
        <p>{t("Auth.signUpClosed")}</p>
        <p>
          {t("Auth.haveAccount")} <Link href="/sign-in">{t("Auth.signIn")}</Link>
        </p>
      </main>
    );
  }
  return (
    <main>
      <h1>{t("Metadata.signUpTitle")}</h1>
      <AuthForm mode="sign-up" />
      <p>
        {t("Auth.haveAccount")} <Link href="/sign-in">{t("Auth.signIn")}</Link>
      </p>
      <ContinueAnonymouslyButton />
    </main>
  );
}
