import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { connection } from "next/server";
import { AuthShell, KeyMark } from "@/components/auth";
import styles from "@/components/auth/auth.module.css";
import { AuthForm, ContinueAnonymouslyButton } from "@/components/auth-form";
import { RESET_PASSWORD_PAGE, signUpOpen } from "@/lib/auth/codes";
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
    <AuthShell
      accent="blue"
      mark={<KeyMark className={styles.tileMark} />}
      headline={t("Auth.page.signIn.title")}
      lead={t("Auth.page.signIn.lead")}
    >
      {/* The other ways in are the form's own slot, so they disappear the moment the next step is
          in the inbox rather than sitting under it offering to start over. */}
      <AuthForm mode="sign-in">
        <p className={styles.footRow}>
          <Link className={styles.quiet} href={RESET_PASSWORD_PAGE}>
            {t("Auth.forgotPassword")}
          </Link>
        </p>

        {open ? (
          <>
            <p className={styles.divider}>
              <span>{t("Auth.or")}</span>
            </p>
            <p className={styles.footRow}>
              {t("Auth.noAccount")}{" "}
              <Link className={styles.quiet} href="/sign-up">
                {t("Auth.signUp")}
              </Link>
            </p>
            <ContinueAnonymouslyButton />
          </>
        ) : null}
      </AuthForm>
    </AuthShell>
  );
}
