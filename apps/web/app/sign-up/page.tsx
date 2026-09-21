import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { connection } from "next/server";
import { AuthShell, BlockedMark, NewAccountMark } from "@/components/auth";
import styles from "@/components/auth/auth.module.css";
import { AuthForm, ContinueAnonymouslyButton } from "@/components/auth-form";
import { signUpOpen } from "@/lib/auth/codes";
import { appEnv } from "@/lib/env";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Metadata");
  return { title: t("signUpTitle"), robots: { index: false, follow: false } };
}

export default async function SignUpPage() {
  // Rendered per request: APP_ENV is read at runtime, not at build.
  await connection();
  const t = await getTranslations();

  if (!signUpOpen(appEnv())) {
    return (
      <AuthShell
        accent="red"
        mark={<BlockedMark className={styles.tileMark} />}
        headline={t("Auth.signUpClosedHeading")}
        lead={t("Auth.signUpClosed")}
      >
        <h2 className={styles.cardTitle}>{t("Auth.haveAccount")}</h2>
        <p className={styles.cardBody}>{t("Auth.page.signUp.closedBody")}</p>
        <Link className={styles.primary} href="/sign-in">
          {t("Auth.signIn")}
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      accent="green"
      mark={<NewAccountMark className={styles.tileMark} />}
      headline={t("Auth.page.signUp.title")}
      lead={t("Auth.page.signUp.lead")}
    >
      {/* The other ways in are the form's own slot, so they disappear the moment the next step is
          in the inbox: nobody who has just created an account wants "continue without an account"
          underneath the sentence telling them to open the link. */}
      <AuthForm mode="sign-up">
        <p className={styles.divider}>
          <span>{t("Auth.or")}</span>
        </p>
        <p className={styles.footRow}>
          {t("Auth.haveAccount")}{" "}
          <Link className={styles.quiet} href="/sign-in">
            {t("Auth.signIn")}
          </Link>
        </p>
        <ContinueAnonymouslyButton />
      </AuthForm>
    </AuthShell>
  );
}
