"use client";

import { useTranslations } from "next-intl";

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("Error");
  return (
    <main>
      <h1>{t("heading")}</h1>
      <button type="button" onClick={reset}>
        {t("retry")}
      </button>
    </main>
  );
}
