import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { AuthShell, KeyMark, MailMark } from "@/components/auth";
import styles from "@/components/auth/auth.module.css";
import { ResetPasswordRequestForm, SetNewPasswordForm } from "@/components/auth-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Auth");
  return { title: t("resetTitle"), robots: { index: false, follow: false } };
}

/**
 * Both halves of a password reset. Without a token it asks for the address; Better Auth's
 * `/reset-password/<token>` callback sends the person back here with `?token=` (set a new
 * password) or `?error=INVALID_TOKEN` (expired or already used).
 */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { token, error } = await searchParams;
  const t = await getTranslations("Auth");

  if (typeof token === "string" && token) {
    return (
      <AuthShell
        accent="blue"
        mark={<KeyMark className={styles.tileMark} />}
        headline={t("resetTitle")}
        lead={t("page.reset.setLead")}
      >
        <SetNewPasswordForm token={token} />
      </AuthShell>
    );
  }

  return (
    <AuthShell
      accent="yellow"
      mark={<MailMark className={styles.tileMark} />}
      headline={error ? t("resetLinkInvalidHeading") : t("resetRequestHeading")}
      lead={error ? t("resetLinkInvalid") : t("resetRequest")}
    >
      <ResetPasswordRequestForm />
      <p className={styles.footRow}>
        <Link className={styles.quiet} href="/sign-in">
          {t("page.backToSignIn")}
        </Link>
      </p>
    </AuthShell>
  );
}
