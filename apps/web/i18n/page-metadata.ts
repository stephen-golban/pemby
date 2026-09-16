import type { Metadata, ResolvingMetadata } from "next";
import { getTranslations } from "next-intl/server";

export const SITE_URL = "https://pemby.app";

/** Public pages with their own title and description under `Seo.pages` (messages/en/seo.json). */
export type SeoPage = "home" | "pricing" | "terms" | "privacy" | "refunds";

const PATHS: Record<SeoPage, string> = {
  home: "/",
  pricing: "/pricing",
  terms: "/terms",
  privacy: "/privacy",
  refunds: "/refunds",
};

export const PUBLIC_PATHS: readonly string[] = Object.values(PATHS);

/**
 * Title, description, canonical URL, Open Graph and Twitter fields for one public page. A page's
 * `openGraph` and `twitter` objects replace the root layout's whole, including the share images
 * from `app/opengraph-image.tsx` and `app/twitter-image.tsx`, so those are carried over from `parent`.
 */
export async function pageMetadata(page: SeoPage, parent: ResolvingMetadata): Promise<Metadata> {
  const [t, inherited] = await Promise.all([getTranslations("Seo"), parent]);
  const title = t(`pages.${page}.title`);
  const description = t(`pages.${page}.description`);
  const path = PATHS[page];
  // The landing page title stands alone; every other page goes through the layout's template.
  const shareTitle = page === "home" ? title : `${title} · ${t("siteName")}`;
  return {
    title: page === "home" ? { absolute: title } : title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title: shareTitle,
      description,
      url: path,
      siteName: t("siteName"),
      type: "website",
      locale: "en_US",
      images: inherited.openGraph?.images,
    },
    twitter: {
      card: "summary_large_image",
      title: shareTitle,
      description,
      images: inherited.twitter?.images,
    },
  };
}
