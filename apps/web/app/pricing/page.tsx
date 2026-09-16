import type { Metadata } from "next";
import { PricingPage } from "@/components/pricing/pricing-page";
import { getNamespaceTranslations } from "@/i18n/namespaces";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getNamespaceTranslations("Pricing");
  return { title: t("meta.title"), description: t("meta.description") };
}

export default function Page() {
  return <PricingPage />;
}
