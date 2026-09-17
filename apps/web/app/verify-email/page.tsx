import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
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
      <main>
        <h1>{expired ? t("expiredHeading") : t("invalidHeading")}</h1>
        <p>{expired ? t("expired") : t("invalid")}</p>
        <ResendVerificationForm />
      </main>
    );
  }

  const session = await getSession(await headers());
  if (session && !session.user.isAnonymous && session.user.emailVerified) {
    redirect(AFTER_VERIFY_PATH);
  }

  // Reached without a fresh sign-in, e.g. a link opened again after the email was confirmed.
  return (
    <main>
      <h1>{t("verifiedHeading")}</h1>
      <p>{t("verified")}</p>
      <p>
        <Link href="/sign-in">{t("signIn")}</Link>
      </p>
    </main>
  );
}
