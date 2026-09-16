import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ForbiddenMessage } from "@/components/forbidden-message";

// Target of proxy.ts rewrites for refused product pages (served with status 403).
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Metadata");
  return { title: t("forbiddenTitle"), robots: { index: false } };
}

export default function AccessDeniedPage() {
  return <ForbiddenMessage />;
}
