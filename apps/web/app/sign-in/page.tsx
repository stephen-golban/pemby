import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { connection } from "next/server";
import { AuthForm, ContinueAnonymouslyButton } from "@/components/auth-form";
import { signUpOpen } from "@/lib/auth/codes";
import { appEnv } from "@/lib/env";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Metadata");
  return { title: t("signInTitle"), robots: { index: false, follow: false } };
}

export default async function SignInPage() {
  // Rendered per request: APP_ENV is read at runtime, not at build.
  await connection();
  const open = signUpOpen(appEnv());
  const t = await getTranslations();
  return (
    <main>
      <h1>{t("Metadata.signInTitle")}</h1>
      <AuthForm mode="sign-in" />
      {open ? (
        <>
          <p>
            {t("Auth.noAccount")} <Link href="/sign-up">{t("Auth.signUp")}</Link>
          </p>
          <ContinueAnonymouslyButton />
        </>
      ) : null}
    </main>
  );
}
