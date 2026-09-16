import type { Metadata, ResolvingMetadata } from "next";
import { LegalPage } from "@/components/legal/legal-page";
import { pageMetadata } from "@/i18n/page-metadata";

export function generateMetadata(_props: unknown, parent: ResolvingMetadata): Promise<Metadata> {
  return pageMetadata("refunds", parent);
}

export default function Page() {
  return <LegalPage doc="refunds" />;
}
