import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ComingSoon } from "@/components/coming-soon";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Metadata");
  return { title: t("pricingTitle") };
}

export default async function PricingPage() {
  const t = await getTranslations("Metadata");
  return <ComingSoon title={t("pricingTitle")} />;
}
