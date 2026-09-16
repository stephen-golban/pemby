import { getTranslations } from "next-intl/server";
import Link from "next/link";

export async function ComingSoon({ title }: { title: string }) {
  const t = await getTranslations("ComingSoon");
  return (
    <main>
      <h1>{title}</h1>
      <p>{t("body")}</p>
      <p>
        <Link href="/">{t("backHome")}</Link>
      </p>
    </main>
  );
}
