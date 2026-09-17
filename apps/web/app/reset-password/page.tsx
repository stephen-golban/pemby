import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
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
      <main>
        <h1>{t("resetTitle")}</h1>
        <SetNewPasswordForm token={token} />
      </main>
    );
  }

  return (
    <main>
      <h1>{error ? t("resetLinkInvalidHeading") : t("resetRequestHeading")}</h1>
      <p>{error ? t("resetLinkInvalid") : t("resetRequest")}</p>
      <ResetPasswordRequestForm />
    </main>
  );
}
