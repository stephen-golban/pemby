import "@pemby/ui/tokens.css";
import "./globals.css";

import { themeInitScript } from "@pemby/ui";
import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { Hanken_Grotesk } from "next/font/google";
import type { ReactNode } from "react";
import { SITE_URL } from "@/i18n/page-metadata";
import { Providers } from "./providers";

// One family for the whole product: a heavy geometric grotesk with a large x-height, matched to
// the pinned reference's display face. Display at 800, titles at 700, body at 400/500. There is no
// second face — no serif and no monospace anywhere in this world.
const grotesk = Hanken_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "700", "800"],
  variable: "--font-grotesk-src",
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Seo");
  const siteName = t("siteName");
  const title = t("pages.home.title");
  const description = t("pages.home.description");
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: title, template: `%s · ${siteName}` },
    description,
    applicationName: siteName,
    // The PWA the web-push channel needs (PLAN D8). Saving the site to the Home Screen is the only
    // way an iPhone can receive push at all (Safari 16.4+), so the manifest link is on every page,
    // not only on the one that offers to turn push on.
    manifest: "/manifest.webmanifest",
    openGraph: { title, description, siteName, type: "website", locale: "en_US" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale} className={grotesk.variable} suppressHydrationWarning>
      <head>
        {/* Applies a stored theme choice before first paint (no flash of the wrong theme). */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <NextIntlClientProvider>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
