import { getTranslations } from "next-intl/server";
import Link from "next/link";

export async function ForbiddenMessage() {
  const t = await getTranslations("Forbidden");
  return (
    <main>
      <h1>{t("heading")}</h1>
      <p>{t("body")}</p>
      <p>
        <Link href="/sign-in">{t("signIn")}</Link>
      </p>
    </main>
  );
}
