import { getTranslations } from "next-intl/server";
import Link from "next/link";

export default async function NotFound() {
  const t = await getTranslations("NotFound");
  return (
    <main>
      <h1>{t("heading")}</h1>
      <p>
        <Link href="/">{t("backHome")}</Link>
      </p>
    </main>
  );
}
