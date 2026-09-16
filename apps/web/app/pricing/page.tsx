import type { Metadata, ResolvingMetadata } from "next";
import { PricingPage } from "@/components/pricing/pricing-page";
import { pageMetadata } from "@/i18n/page-metadata";

export function generateMetadata(_props: unknown, parent: ResolvingMetadata): Promise<Metadata> {
  return pageMetadata("pricing", parent);
}

export default function Page() {
  return <PricingPage />;
}
