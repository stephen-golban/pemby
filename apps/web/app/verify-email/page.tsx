import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell, ArrowMark, CheckMark, MailMark } from "@/components/auth";
import styles from "@/components/auth/auth.module.css";
import { ResendVerificationForm } from "@/components/auth-form";
import { AFTER_VERIFY_PATH } from "@/lib/auth/codes";
import { getSession } from "@/lib/auth/session";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Auth");
  return { title: t("verifyTitle"), robots: { index: false, follow: false } };
}

/**
 * Where every verification link returns (`VERIFY_EMAIL_PAGE`). Better Auth's GET
 * /api/auth/verify-email has already verified the email, settled any pending claim and signed the
 * user in, or appended `?error=` (TOKEN_EXPIRED, INVALID_TOKEN, USER_NOT_FOUND).
 */
export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { error } = await searchParams;
  const t = await getTranslations("Auth");

  if (error) {
    const expired = error === "TOKEN_EXPIRED";
    return (
      <AuthShell
        accent="yellow"
        mark={<MailMark className={styles.tileMark} />}
        headline={expired ? t("expiredHeading") : t("invalidHeading")}
        lead={expired ? t("expired") : t("invalid")}
      >
        <ResendVerificationForm />
        <p className={styles.footRow}>
          <Link className={styles.quiet} href="/sign-in">
            {t("page.backToSignIn")}
          </Link>
        </p>
      </AuthShell>
    );
  }

  const session = await getSession(await headers());
  if (session && !session.user.isAnonymous && session.user.emailVerified) {
    redirect(AFTER_VERIFY_PATH);
  }

  // Reached without a fresh sign-in, e.g. a link opened again after the email was confirmed.
  return (
    <AuthShell
      accent="green"
      mark={<CheckMark className={styles.tileMark} />}
      headline={t("verifiedHeading")}
      lead={t("verified")}
    >
      <h2 className={styles.cardTitle}>{t("page.verify.nextTitle")}</h2>
      <p className={styles.cardBody}>{t("page.verify.nextBody")}</p>
      <Link className={styles.primary} href="/sign-in">
        {t("signIn")}
        <ArrowMark className={styles.arrow} />
      </Link>
    </AuthShell>
  );
}
